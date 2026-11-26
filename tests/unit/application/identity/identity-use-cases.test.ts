import { beforeEach, describe, expect, it } from 'vitest'
import { createAuthenticate } from '../../../../src/contexts/identity/app/use-cases/authenticate'
import { createGetCurrentAccount } from '../../../../src/contexts/identity/app/use-cases/get-current-account'
import { createLogin } from '../../../../src/contexts/identity/app/use-cases/login'
import { createRegisterAccount } from '../../../../src/contexts/identity/app/use-cases/register-account'
import { SESSION_DURATION_MS } from '../../../../src/contexts/identity/domain/session'
import { FakePasswordHasher, FakeTokenGenerator, FixedClock } from '../../../fakes/fake-ports'
import { InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

const PASSWORD = 'correct-horse-battery-staple'

function setup() {
    const deps = {
        unitOfWork: new InMemoryDatabase(),
        passwordHasher: new FakePasswordHasher(),
        tokenGenerator: new FakeTokenGenerator(),
        clock: new FixedClock()
    }
    return {
        ...deps,
        database: deps.unitOfWork,
        registerAccount: createRegisterAccount(deps),
        login: createLogin(deps),
        authenticate: createAuthenticate(deps),
        getCurrentAccount: createGetCurrentAccount(deps)
    }
}

describe('RegisterAccount', () => {
    let ctx: ReturnType<typeof setup>
    beforeEach(() => {
        ctx = setup()
    })

    it('crée le compte avec un email en minuscules et un mot de passe haché', async () => {
        const account = await ctx.registerAccount.execute({ email: 'Alice@Example.com', password: PASSWORD })

        expect(account.email).toBe('alice@example.com')
        expect(ctx.database.state.accounts).toHaveLength(1)
        expect(ctx.database.state.accounts[0]?.passwordHash).toBe(`hashed:${PASSWORD}`)
        expect(JSON.stringify(ctx.database.state)).not.toContain(`"${PASSWORD}"`)
    })

    it('email déjà utilisé, quelle que soit la casse → EMAIL_ALREADY_USED (CONFLICT)', async () => {
        await ctx.registerAccount.execute({ email: 'alice@example.com', password: PASSWORD })

        await expect(
            ctx.registerAccount.execute({ email: 'ALICE@example.com', password: PASSWORD })
        ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED', kind: 'CONFLICT' })
        expect(ctx.database.state.accounts).toHaveLength(1)
    })

    it('deux inscriptions simultanées du même email → une seule réussit', async () => {
        const results = await Promise.allSettled([
            ctx.registerAccount.execute({ email: 'bob@example.com', password: PASSWORD }),
            ctx.registerAccount.execute({ email: 'bob@example.com', password: PASSWORD })
        ])

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((result) => result.status === 'rejected')).toMatchObject({
            reason: { code: 'EMAIL_ALREADY_USED' }
        })
        expect(ctx.database.state.accounts).toHaveLength(1)
    })
})

describe('Login', () => {
    let ctx: ReturnType<typeof setup>
    beforeEach(async () => {
        ctx = setup()
        await ctx.registerAccount.execute({ email: 'alice@example.com', password: PASSWORD })
    })

    it('ouvre une session de 24 h et ne stocke que l’empreinte du jeton', async () => {
        const session = await ctx.login.execute({ email: 'ALICE@example.com', password: PASSWORD })

        expect(session.token).toBe('token-1')
        expect(session.expiresAt.getTime()).toBe(ctx.clock.now().getTime() + SESSION_DURATION_MS)
        expect(ctx.database.state.sessions).toEqual([
            expect.objectContaining({ tokenHash: 'sha256(token-1)', expiresAt: session.expiresAt })
        ])
        expect(JSON.stringify(ctx.database.state.sessions)).not.toContain('"token-1"')
    })

    it('mauvais mot de passe et email inconnu → même erreur INVALID_CREDENTIALS', async () => {
        const wrongPassword = ctx.login.execute({ email: 'alice@example.com', password: 'wrong-password-123' })
        const unknownEmail = ctx.login.execute({ email: 'nobody@example.com', password: PASSWORD })

        const expected = { code: 'INVALID_CREDENTIALS', kind: 'UNAUTHENTICATED', message: 'Invalid email or password' }
        await expect(wrongPassword).rejects.toMatchObject(expected)
        await expect(unknownEmail).rejects.toMatchObject(expected)
        expect(ctx.database.state.sessions).toHaveLength(0)
    })

    it('email inconnu → une vérification de mot de passe quand même (D7)', async () => {
        await expect(ctx.login.execute({ email: 'nobody@example.com', password: PASSWORD })).rejects.toThrow()

        expect(ctx.passwordHasher.verifyCalls).toBe(1)
    })

    it("un échec du hash factice n'est pas conservé : l'appel suivant le recalcule", async () => {
        const hasher = new FakePasswordHasher()
        const originalHash = hasher.hash.bind(hasher)
        let failures = 1
        hasher.hash = async (plain) => {
            if (failures-- > 0) throw new Error('panne du hachage')
            return originalHash(plain)
        }
        const login = createLogin({ ...ctx, passwordHasher: hasher })
        const unknown = { email: 'nobody@example.com', password: PASSWORD }

        await expect(login.execute(unknown)).rejects.toThrow('panne du hachage')
        await expect(login.execute(unknown)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    })
})

describe('Authenticate et GetCurrentAccount', () => {
    let ctx: ReturnType<typeof setup>
    let token: string
    beforeEach(async () => {
        ctx = setup()
        await ctx.registerAccount.execute({ email: 'alice@example.com', password: PASSWORD })
        token = (await ctx.login.execute({ email: 'alice@example.com', password: PASSWORD })).token
    })

    it('jeton valide → accountId du propriétaire, puis le compte', async () => {
        const auth = await ctx.authenticate.execute(token)
        const account = await ctx.getCurrentAccount.execute(auth)

        expect(auth).toEqual({ accountId: ctx.database.state.accounts[0]?.id })
        expect(account.email).toBe('alice@example.com')
    })

    it('jeton inconnu → UNAUTHENTICATED', async () => {
        await expect(ctx.authenticate.execute('token-inconnu')).rejects.toMatchObject({
            code: 'UNAUTHENTICATED',
            kind: 'UNAUTHENTICATED'
        })
    })

    it("jeton expiré (horloge de test) → UNAUTHENTICATED, valide jusqu'à la dernière milliseconde", async () => {
        ctx.clock.advance(SESSION_DURATION_MS - 1)
        await expect(ctx.authenticate.execute(token)).resolves.toBeDefined()

        ctx.clock.advance(1)
        await expect(ctx.authenticate.execute(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    })
})
