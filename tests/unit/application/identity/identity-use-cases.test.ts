import { beforeEach, describe, expect, it } from 'vitest'
import { createAuthenticate } from '../../../../src/contexts/identity/app/use-cases/authenticate'
import { createGetCurrentAccount } from '../../../../src/contexts/identity/app/use-cases/get-current-account'
import { createLogin } from '../../../../src/contexts/identity/app/use-cases/login'
import { createLogout } from '../../../../src/contexts/identity/app/use-cases/logout'
import { createLogoutAll } from '../../../../src/contexts/identity/app/use-cases/logout-all'
import { createRefreshSession } from '../../../../src/contexts/identity/app/use-cases/refresh-session'
import { createRegisterAccount } from '../../../../src/contexts/identity/app/use-cases/register-account'
import { LOGIN_LOCK_DURATION_MS, MAX_FAILED_LOGIN_ATTEMPTS } from '../../../../src/contexts/identity/domain/account'
import { ACCESS_TOKEN_DURATION_MS, REFRESH_TOKEN_DURATION_MS } from '../../../../src/contexts/identity/domain/session'
import { FakePasswordHasher, FakeTokenGenerator, FixedClock } from '../../../fakes/fake-ports'
import { InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

const PASSWORD = 'correct-horse-battery-staple'
const WRONG = 'wrong-password-123'
const UNAUTHENTICATED = { code: 'UNAUTHENTICATED', kind: 'UNAUTHENTICATED' }
const INVALID_CREDENTIALS = { code: 'INVALID_CREDENTIALS', kind: 'UNAUTHENTICATED', message: 'Invalid email or password' }

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
        refreshSession: createRefreshSession(deps),
        logout: createLogout(deps),
        logoutAll: createLogoutAll(deps),
        authenticate: createAuthenticate(deps),
        getCurrentAccount: createGetCurrentAccount(deps)
    }
}

type Context = ReturnType<typeof setup>

async function setupWithAlice() {
    const ctx = setup()
    await ctx.registerAccount.execute({ email: 'alice@example.com', password: PASSWORD })
    return ctx
}

const loginAlice = (ctx: Context) => ctx.login.execute({ email: 'alice@example.com', password: PASSWORD })

describe('RegisterAccount', () => {
    let ctx: Context
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

describe('Login (AUTH-01)', () => {
    let ctx: Context
    beforeEach(async () => {
        ctx = await setupWithAlice()
    })

    it("renvoie les deux jetons ; seules leurs empreintes sont stockées", async () => {
        const tokens = await ctx.login.execute({ email: 'ALICE@example.com', password: PASSWORD })
        const now = ctx.clock.now().getTime()

        expect(tokens).toEqual({
            accessToken: 'token-1',
            refreshToken: 'token-2',
            accessExpiresAt: new Date(now + ACCESS_TOKEN_DURATION_MS),
            refreshExpiresAt: new Date(now + REFRESH_TOKEN_DURATION_MS)
        })
        expect(ctx.database.state.sessions).toEqual([
            expect.objectContaining({ accessTokenHash: 'sha256(token-1)', revokedAt: null })
        ])
        expect(ctx.database.state.refreshTokens).toEqual([
            expect.objectContaining({ tokenHash: 'sha256(token-2)', usedAt: null })
        ])
        const stored = JSON.stringify([ctx.database.state.sessions, ctx.database.state.refreshTokens])
        expect(stored).not.toContain('"token-1"')
        expect(stored).not.toContain('"token-2"')
    })

    it('mauvais mot de passe et email inconnu → même erreur INVALID_CREDENTIALS', async () => {
        const wrongPassword = ctx.login.execute({ email: 'alice@example.com', password: WRONG })
        const unknownEmail = ctx.login.execute({ email: 'nobody@example.com', password: PASSWORD })

        await expect(wrongPassword).rejects.toMatchObject(INVALID_CREDENTIALS)
        await expect(unknownEmail).rejects.toMatchObject(INVALID_CREDENTIALS)
        expect(ctx.database.state.sessions).toHaveLength(0)
    })

    it('email inconnu → une vérification de mot de passe quand même (L1 D7)', async () => {
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
    let ctx: Context
    let accessToken: string
    beforeEach(async () => {
        ctx = await setupWithAlice()
        accessToken = (await loginAlice(ctx)).accessToken
    })

    it("jeton d'accès valide → compte et session, puis le compte", async () => {
        const auth = await ctx.authenticate.execute(accessToken)
        const account = await ctx.getCurrentAccount.execute(auth)

        expect(auth).toEqual({
            accountId: ctx.database.state.accounts[0]?.id,
            sessionId: ctx.database.state.sessions[0]?.id
        })
        expect(account.email).toBe('alice@example.com')
    })

    it('jeton inconnu, ou jeton de rafraîchissement présenté comme accès → UNAUTHENTICATED', async () => {
        await expect(ctx.authenticate.execute('token-inconnu')).rejects.toMatchObject(UNAUTHENTICATED)
        await expect(ctx.authenticate.execute('token-2')).rejects.toMatchObject(UNAUTHENTICATED)
    })

    it("jeton d'accès expiré (horloge de test) → UNAUTHENTICATED, valide jusqu'à la dernière milliseconde", async () => {
        ctx.clock.advance(ACCESS_TOKEN_DURATION_MS - 1)
        await expect(ctx.authenticate.execute(accessToken)).resolves.toBeDefined()

        ctx.clock.advance(1)
        await expect(ctx.authenticate.execute(accessToken)).rejects.toMatchObject(UNAUTHENTICATED)
    })
})

describe('RefreshSession (AUTH-01)', () => {
    let ctx: Context
    let first: Awaited<ReturnType<typeof loginAlice>>
    beforeEach(async () => {
        ctx = await setupWithAlice()
        first = await loginAlice(ctx)
    })

    it('rotation : nouveaux jetons, ancien jeton de rafraîchissement consommé, ancien accès invalide', async () => {
        ctx.clock.advance(60_000)

        const second = await ctx.refreshSession.execute({ refreshToken: first.refreshToken })

        expect(second).toEqual({
            accessToken: 'token-3',
            refreshToken: 'token-4',
            accessExpiresAt: new Date(ctx.clock.now().getTime() + ACCESS_TOKEN_DURATION_MS),
            refreshExpiresAt: first.refreshExpiresAt // famille non glissante
        })
        expect(ctx.database.state.sessions).toHaveLength(1)
        expect(ctx.database.state.refreshTokens).toEqual([
            expect.objectContaining({ tokenHash: 'sha256(token-2)', usedAt: ctx.clock.now() }),
            expect.objectContaining({ tokenHash: 'sha256(token-4)', usedAt: null })
        ])
        await expect(ctx.authenticate.execute(first.accessToken)).rejects.toMatchObject(UNAUTHENTICATED)
        await expect(ctx.authenticate.execute(second.accessToken)).resolves.toBeDefined()
    })

    it("un jeton d'accès expiré se renouvelle avec le jeton de rafraîchissement", async () => {
        ctx.clock.advance(ACCESS_TOKEN_DURATION_MS)
        await expect(ctx.authenticate.execute(first.accessToken)).rejects.toMatchObject(UNAUTHENTICATED)

        const second = await ctx.refreshSession.execute({ refreshToken: first.refreshToken })

        await expect(ctx.authenticate.execute(second.accessToken)).resolves.toBeDefined()
    })

    it('réutilisation : 401 et toute la famille révoquée, y compris le dernier jeton émis (L6 D4)', async () => {
        const second = await ctx.refreshSession.execute({ refreshToken: first.refreshToken })

        await expect(ctx.refreshSession.execute({ refreshToken: first.refreshToken })).rejects.toMatchObject(UNAUTHENTICATED)

        expect(ctx.database.state.sessions[0]?.revokedAt).toEqual(ctx.clock.now()) // révocation validée malgré le 401
        await expect(ctx.authenticate.execute(second.accessToken)).rejects.toMatchObject(UNAUTHENTICATED)
        await expect(ctx.refreshSession.execute({ refreshToken: second.refreshToken })).rejects.toMatchObject(UNAUTHENTICATED)
    })

    it("la réutilisation ne touche pas les autres familles du compte", async () => {
        const other = await loginAlice(ctx)
        await ctx.refreshSession.execute({ refreshToken: first.refreshToken })

        await expect(ctx.refreshSession.execute({ refreshToken: first.refreshToken })).rejects.toThrow()

        await expect(ctx.authenticate.execute(other.accessToken)).resolves.toBeDefined()
    })

    it("famille échue (7 jours, horloge de test) → 401, valide jusqu'à la dernière milliseconde", async () => {
        ctx.clock.advance(REFRESH_TOKEN_DURATION_MS - 1)
        const second = await ctx.refreshSession.execute({ refreshToken: first.refreshToken })

        ctx.clock.advance(1)
        await expect(ctx.refreshSession.execute({ refreshToken: second.refreshToken })).rejects.toMatchObject(UNAUTHENTICATED)
        expect(ctx.database.state.sessions[0]?.revokedAt).toBeNull() // échue, pas réutilisée
    })

    it('jeton inconnu, ou jeton d’accès présenté comme rafraîchissement → 401 sans effet', async () => {
        await expect(ctx.refreshSession.execute({ refreshToken: 'token-inconnu' })).rejects.toMatchObject(UNAUTHENTICATED)
        await expect(ctx.refreshSession.execute({ refreshToken: first.accessToken })).rejects.toMatchObject(UNAUTHENTICATED)

        expect(ctx.database.state.sessions[0]?.revokedAt).toBeNull()
    })

    it('2 rafraîchissements simultanés du même jeton → 1 succès, 1 × 401, famille révoquée', async () => {
        const results = await Promise.allSettled([
            ctx.refreshSession.execute({ refreshToken: first.refreshToken }),
            ctx.refreshSession.execute({ refreshToken: first.refreshToken })
        ])

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: UNAUTHENTICATED })
        expect(ctx.database.state.sessions[0]?.revokedAt).not.toBeNull()
    })
})

describe('Logout et LogoutAll (AUTH-02)', () => {
    let ctx: Context
    beforeEach(async () => {
        ctx = await setupWithAlice()
    })

    it("déconnexion : jeton d'accès et jeton de rafraîchissement → 401 ; l'autre session reste active", async () => {
        const current = await loginAlice(ctx)
        const other = await loginAlice(ctx)

        await ctx.logout.execute(await ctx.authenticate.execute(current.accessToken))

        await expect(ctx.authenticate.execute(current.accessToken)).rejects.toMatchObject(UNAUTHENTICATED)
        await expect(ctx.refreshSession.execute({ refreshToken: current.refreshToken })).rejects.toMatchObject(UNAUTHENTICATED)
        await expect(ctx.authenticate.execute(other.accessToken)).resolves.toBeDefined()
        await expect(ctx.refreshSession.execute({ refreshToken: other.refreshToken })).resolves.toBeDefined()
    })

    it('déconnexion de toutes les sessions du compte, pas de celles des autres comptes', async () => {
        await ctx.registerAccount.execute({ email: 'bob@example.com', password: PASSWORD })
        const first = await loginAlice(ctx)
        const second = await loginAlice(ctx)
        const bob = await ctx.login.execute({ email: 'bob@example.com', password: PASSWORD })

        await ctx.logoutAll.execute(await ctx.authenticate.execute(first.accessToken))

        for (const tokens of [first, second]) {
            await expect(ctx.authenticate.execute(tokens.accessToken)).rejects.toMatchObject(UNAUTHENTICATED)
            await expect(ctx.refreshSession.execute({ refreshToken: tokens.refreshToken })).rejects.toMatchObject(UNAUTHENTICATED)
        }
        await expect(ctx.authenticate.execute(bob.accessToken)).resolves.toBeDefined()
    })
})

describe('Login — verrouillage après échecs (AUTH-03)', () => {
    let ctx: Context
    beforeEach(async () => {
        ctx = await setupWithAlice()
    })

    const failAlice = async (times: number) => {
        for (let i = 0; i < times; i += 1) {
            await expect(ctx.login.execute({ email: 'alice@example.com', password: WRONG })).rejects.toMatchObject(
                INVALID_CREDENTIALS
            )
        }
    }

    it('au seuil, le compte est verrouillé : le bon mot de passe donne la même erreur, Argon2 exécuté (L6 D6)', async () => {
        await failAlice(MAX_FAILED_LOGIN_ATTEMPTS)
        const verifyCallsBefore = ctx.passwordHasher.verifyCalls

        await expect(loginAlice(ctx)).rejects.toMatchObject(INVALID_CREDENTIALS)

        expect(ctx.passwordHasher.verifyCalls).toBe(verifyCallsBefore + 1)
        expect(ctx.database.state.sessions).toHaveLength(0)
        expect(ctx.database.state.accounts[0]).toMatchObject({
            failedLoginCount: MAX_FAILED_LOGIN_ATTEMPTS,
            lockedUntil: new Date(ctx.clock.now().getTime() + LOGIN_LOCK_DURATION_MS)
        })
    })

    it("déverrouillage par l'horloge : connexion acceptée à l'instant exact de fin, compteur remis à zéro", async () => {
        await failAlice(MAX_FAILED_LOGIN_ATTEMPTS)

        ctx.clock.advance(LOGIN_LOCK_DURATION_MS - 1)
        await expect(loginAlice(ctx)).rejects.toMatchObject(INVALID_CREDENTIALS)
        ctx.clock.advance(1)
        await expect(loginAlice(ctx)).resolves.toBeDefined()

        expect(ctx.database.state.accounts[0]).toMatchObject({ failedLoginCount: 0, lockedUntil: null })
    })

    it('une connexion réussie remet le compteur à zéro', async () => {
        await failAlice(MAX_FAILED_LOGIN_ATTEMPTS - 1)
        await loginAlice(ctx)
        await failAlice(MAX_FAILED_LOGIN_ATTEMPTS - 1)

        await expect(loginAlice(ctx)).resolves.toBeDefined()
    })

    it("aucune énumération : email inconnu → même erreur, sans compteur ni verrou", async () => {
        for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS + 1; i += 1) {
            await expect(ctx.login.execute({ email: 'nobody@example.com', password: WRONG })).rejects.toMatchObject(
                INVALID_CREDENTIALS
            )
        }
        expect(ctx.database.state.accounts).toHaveLength(1)
    })

    it('échecs simultanés : tous comptés', async () => {
        await Promise.allSettled(
            Array.from({ length: MAX_FAILED_LOGIN_ATTEMPTS }, () =>
                ctx.login.execute({ email: 'alice@example.com', password: WRONG })
            )
        )

        expect(ctx.database.state.accounts[0]?.failedLoginCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS)
        await expect(loginAlice(ctx)).rejects.toMatchObject(INVALID_CREDENTIALS)
    })

    it('les sessions déjà ouvertes restent valides pendant le verrouillage', async () => {
        const tokens = await loginAlice(ctx)
        await failAlice(MAX_FAILED_LOGIN_ATTEMPTS)

        await expect(ctx.authenticate.execute(tokens.accessToken)).resolves.toBeDefined()
    })
})
