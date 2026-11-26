import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createAuthenticate } from '../../../../src/contexts/identity/app/use-cases/authenticate'
import { createChangeAccountRole } from '../../../../src/contexts/identity/app/use-cases/change-account-role'
import { createListAccounts } from '../../../../src/contexts/identity/app/use-cases/list-accounts'
import { createLogin } from '../../../../src/contexts/identity/app/use-cases/login'
import { createReactivateAccount } from '../../../../src/contexts/identity/app/use-cases/reactivate-account'
import { createRefreshSession } from '../../../../src/contexts/identity/app/use-cases/refresh-session'
import { createRegisterAccount } from '../../../../src/contexts/identity/app/use-cases/register-account'
import { createSuspendAccount } from '../../../../src/contexts/identity/app/use-cases/suspend-account'
import { ROLES, type RoleName } from '../../../../src/contexts/identity/domain/permissions'
import { FakePasswordHasher, FakeTokenGenerator, FixedClock } from '../../../fakes/fake-ports'
import { InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

const PASSWORD = 'correct-horse-battery-staple'
const UNAUTHENTICATED = { code: 'UNAUTHENTICATED', kind: 'UNAUTHENTICATED' }
const FORBIDDEN = { code: 'FORBIDDEN', kind: 'FORBIDDEN', message: 'Insufficient permissions' }
const SELF = { code: 'SELF_ADMINISTRATION_REFUSED', kind: 'RULE_VIOLATION' }

function setup() {
    const deps = {
        unitOfWork: new InMemoryDatabase(),
        passwordHasher: new FakePasswordHasher(),
        tokenGenerator: new FakeTokenGenerator(),
        clock: new FixedClock()
    }
    const ctx = {
        ...deps,
        database: deps.unitOfWork,
        registerAccount: createRegisterAccount(deps),
        login: createLogin(deps),
        refreshSession: createRefreshSession(deps),
        authenticate: createAuthenticate(deps),
        listAccounts: createListAccounts(deps),
        suspendAccount: createSuspendAccount(deps),
        reactivateAccount: createReactivateAccount(deps),
        changeAccountRole: createChangeAccountRole(deps)
    }

    /** Inscrit un compte puis lui donne un rôle directement en base (le seed fait de même pour l'administrateur). */
    async function account(name: string, role: RoleName = 'PLAYER') {
        const { id } = await ctx.registerAccount.execute({ email: `${name}@example.com`, password: PASSWORD })
        setPermissions(id, ROLES[role])
        return id
    }

    function setPermissions(id: string, mask: number) {
        const record = ctx.database.state.accounts.find((candidate) => candidate.id === id)
        if (!record) throw new Error(`Compte inconnu : ${id}`)
        record.permissions = mask
    }

    const login = (name: string) => ctx.login.execute({ email: `${name}@example.com`, password: PASSWORD })

    return { ...ctx, account, setPermissions, login }
}

describe('Authenticate — permissions relues à chaque requête (ROLE-02)', () => {
    it('permission présente : contexte renvoyé ; absente : FORBIDDEN', async () => {
        const ctx = setup()
        const id = await ctx.account('alice')
        const { accessToken } = await ctx.login('alice')

        await expect(ctx.authenticate.execute(accessToken, 'PLAY')).resolves.toMatchObject({ accountId: id })
        await expect(ctx.authenticate.execute(accessToken, 'ACCOUNTS_READ')).rejects.toMatchObject(FORBIDDEN)
    })

    it('retrait de droit : effet immédiat, sans nouvelle connexion', async () => {
        const ctx = setup()
        const id = await ctx.account('alice')
        const { accessToken } = await ctx.login('alice')
        await ctx.authenticate.execute(accessToken, 'PLAY')

        ctx.setPermissions(id, 0)

        await expect(ctx.authenticate.execute(accessToken, 'PLAY')).rejects.toMatchObject(FORBIDDEN)
        await expect(ctx.authenticate.execute(accessToken)).resolves.toMatchObject({ accountId: id })
    })

    it('compte suspendu : même 401 que sans jeton valide, avant tout contrôle de permission (L7 D7)', async () => {
        const ctx = setup()
        const id = await ctx.account('alice')
        const { accessToken } = await ctx.login('alice')
        const record = ctx.database.state.accounts.find((candidate) => candidate.id === id)
        if (record) record.suspendedAt = new Date()

        await expect(ctx.authenticate.execute(accessToken)).rejects.toMatchObject(UNAUTHENTICATED)
        await expect(ctx.authenticate.execute(accessToken, 'ACCOUNTS_READ')).rejects.toMatchObject(UNAUTHENTICATED)
    })
})

describe('ListAccounts (ROLE-03)', () => {
    it('du plus ancien au plus récent, avec le rôle et sans donnée sensible (L7 D8)', async () => {
        const ctx = setup()
        await ctx.account('admin', 'ADMIN')
        await ctx.account('bob')
        await ctx.account('custom')
        const custom = ctx.database.state.accounts[2]
        if (custom) custom.permissions = 0b0011

        const accounts = await ctx.listAccounts.execute()

        expect(accounts.map(({ email, role, suspendedAt }) => [email, role, suspendedAt])).toEqual([
            ['admin@example.com', 'ADMIN', null],
            ['bob@example.com', 'PLAYER', null],
            ['custom@example.com', null, null]
        ])
        expect(Object.keys(accounts[0] ?? {}).sort()).toEqual(['createdAt', 'email', 'id', 'role', 'suspendedAt'])
    })
})

describe('SuspendAccount et ReactivateAccount (ROLE-03)', () => {
    it('suspendre révoque toutes les sessions ; la connexion est ensuite refusée comme un mauvais mot de passe', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')
        const bobId = await ctx.account('bob')
        const first = await ctx.login('bob')
        const second = await ctx.login('bob')

        const output = await ctx.suspendAccount.execute({ accountId: adminId, targetAccountId: bobId })

        expect(output).toMatchObject({ id: bobId, role: 'PLAYER', suspendedAt: ctx.clock.now() })
        for (const tokens of [first, second]) {
            await expect(ctx.authenticate.execute(tokens.accessToken)).rejects.toMatchObject(UNAUTHENTICATED)
            await expect(ctx.refreshSession.execute({ refreshToken: tokens.refreshToken })).rejects.toMatchObject(
                UNAUTHENTICATED
            )
        }
        await expect(ctx.login('bob')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', kind: 'UNAUTHENTICATED' })
        expect(ctx.database.state.accounts.find((account) => account.id === bobId)?.failedLoginCount).toBe(0)
    })

    it('les sessions des autres comptes restent actives', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')
        const bobId = await ctx.account('bob')
        await ctx.account('carol')
        const carol = await ctx.login('carol')

        await ctx.suspendAccount.execute({ accountId: adminId, targetAccountId: bobId })

        await expect(ctx.authenticate.execute(carol.accessToken)).resolves.toBeDefined()
    })

    it('idempotente : la date de la première suspension est conservée (L7 D4)', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')
        const bobId = await ctx.account('bob')
        const firstAt = ctx.clock.now()

        await ctx.suspendAccount.execute({ accountId: adminId, targetAccountId: bobId })
        ctx.clock.advance(60_000)
        const again = await ctx.suspendAccount.execute({ accountId: adminId, targetAccountId: bobId })

        expect(again.suspendedAt).toEqual(firstAt)
    })

    it('réactiver : connexion de nouveau acceptée ; idempotente', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')
        const bobId = await ctx.account('bob')
        await ctx.suspendAccount.execute({ accountId: adminId, targetAccountId: bobId })

        await ctx.reactivateAccount.execute({ accountId: adminId, targetAccountId: bobId })
        const again = await ctx.reactivateAccount.execute({ accountId: adminId, targetAccountId: bobId })

        expect(again.suspendedAt).toBeNull()
        const tokens = await ctx.login('bob')
        await expect(ctx.authenticate.execute(tokens.accessToken, 'PLAY')).resolves.toMatchObject({ accountId: bobId })
    })

    it('compte inconnu → ACCOUNT_NOT_FOUND (NOT_FOUND)', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')

        await expect(
            ctx.suspendAccount.execute({ accountId: adminId, targetAccountId: randomUUID() })
        ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND', kind: 'NOT_FOUND', message: 'Account not found' })
    })

    it('se suspendre soi-même → SELF_ADMINISTRATION_REFUSED, sessions intactes (L7 D6)', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')
        const tokens = await ctx.login('admin')

        await expect(ctx.suspendAccount.execute({ accountId: adminId, targetAccountId: adminId })).rejects.toMatchObject(
            SELF
        )
        await expect(ctx.authenticate.execute(tokens.accessToken)).resolves.toBeDefined()
    })

    it('un modérateur ne suspend pas un administrateur → FORBIDDEN, aucune session révoquée (L7 D5)', async () => {
        const ctx = setup()
        const moderatorId = await ctx.account('moderator', 'MODERATOR')
        const adminId = await ctx.account('admin', 'ADMIN')
        const tokens = await ctx.login('admin')

        await expect(
            ctx.suspendAccount.execute({ accountId: moderatorId, targetAccountId: adminId })
        ).rejects.toMatchObject(FORBIDDEN)
        await expect(ctx.authenticate.execute(tokens.accessToken)).resolves.toBeDefined()
    })
})

describe('ChangeAccountRole (ROLE-03)', () => {
    it('attribue un rôle nommé ; pris en compte à la requête suivante du compte visé', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')
        const bobId = await ctx.account('bob')
        const bob = await ctx.login('bob')
        await expect(ctx.authenticate.execute(bob.accessToken, 'ACCOUNTS_READ')).rejects.toMatchObject(FORBIDDEN)

        const output = await ctx.changeAccountRole.execute({ accountId: adminId, targetAccountId: bobId, role: 'MODERATOR' })

        expect(output.role).toBe('MODERATOR')
        expect(ctx.database.state.accounts.find((account) => account.id === bobId)?.permissions).toBe(ROLES.MODERATOR)
        await expect(ctx.authenticate.execute(bob.accessToken, 'ACCOUNTS_READ')).resolves.toBeDefined()
    })

    it('retirer ses propres droits d’administration → SELF_ADMINISTRATION_REFUSED, rôle inchangé (L7 D6)', async () => {
        const ctx = setup()
        const adminId = await ctx.account('admin', 'ADMIN')

        await expect(
            ctx.changeAccountRole.execute({ accountId: adminId, targetAccountId: adminId, role: 'PLAYER' })
        ).rejects.toMatchObject(SELF)
        expect(ctx.database.state.accounts[0]?.permissions).toBe(ROLES.ADMIN)
    })

    it('un acteur ne peut attribuer un rôle plus privilégié que le sien → FORBIDDEN (L7 D5)', async () => {
        const ctx = setup()
        const actorId = await ctx.account('actor')
        ctx.setPermissions(actorId, ROLES.PLAYER | 0b1000) // gère les rôles sans être modérateur
        const bobId = await ctx.account('bob')

        await expect(
            ctx.changeAccountRole.execute({ accountId: actorId, targetAccountId: bobId, role: 'ADMIN' })
        ).rejects.toMatchObject(FORBIDDEN)
        expect(ctx.database.state.accounts[1]?.permissions).toBe(ROLES.PLAYER)
    })
})
