import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuthenticate } from '../../src/contexts/identity/app/use-cases/authenticate'
import { createChangeAccountRole } from '../../src/contexts/identity/app/use-cases/change-account-role'
import { createLogin } from '../../src/contexts/identity/app/use-cases/login'
import { createRegisterAccount } from '../../src/contexts/identity/app/use-cases/register-account'
import { createSuspendAccount } from '../../src/contexts/identity/app/use-cases/suspend-account'
import { Email } from '../../src/contexts/identity/domain/email'
import { NewPassword } from '../../src/contexts/identity/domain/password'
import { ROLES } from '../../src/contexts/identity/domain/permissions'
import { createArgon2PasswordHasher } from '../../src/contexts/identity/infra/argon2-password-hasher'
import { createCryptoTokenGenerator } from '../../src/contexts/identity/infra/crypto-token-generator'
import { createEventHandlers } from '../../src/platform/events/event-handlers'
import type { PrismaClient } from '../../src/platform/prisma/client'
import { createPrismaUnitOfWork } from '../../src/platform/prisma/prisma-unit-of-work'
import { seedAdminAccount } from '../../src/platform/prisma/seed-admin'
import { createCryptoRandomSource } from '../../src/platform/system/crypto-random-source'
import { createSystemClock } from '../../src/platform/system/system-clock'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

const PASSWORD = 'correct-horse-battery-staple'

describe('rôles et administration sur PostgreSQL (ROLE-01 à ROLE-03)', () => {
    let prisma: PrismaClient
    const passwordHasher = createArgon2PasswordHasher()
    let registerAccount: ReturnType<typeof createRegisterAccount>
    let login: ReturnType<typeof createLogin>
    let authenticate: ReturnType<typeof createAuthenticate>
    let suspendAccount: ReturnType<typeof createSuspendAccount>
    let changeAccountRole: ReturnType<typeof createChangeAccountRole>

    beforeAll(async () => {
        prisma = await connectTestDatabase()
        await deleteTestAccounts(prisma)
        const deps = {
            unitOfWork: createPrismaUnitOfWork(prisma, createEventHandlers({ random: createCryptoRandomSource() })),
            passwordHasher,
            tokenGenerator: createCryptoTokenGenerator(),
            clock: createSystemClock()
        }
        registerAccount = createRegisterAccount(deps)
        login = createLogin(deps)
        authenticate = createAuthenticate(deps)
        suspendAccount = createSuspendAccount(deps)
        changeAccountRole = createChangeAccountRole(deps)
    })

    afterAll(async () => {
        await deleteTestAccounts(prisma)
        await prisma.$disconnect()
    })

    const emailOf = (name: string) => `${name}${TEST_EMAIL_DOMAIN}`

    async function register(name: string, permissions: number = ROLES.PLAYER) {
        const { id } = await registerAccount.execute({ email: emailOf(name), password: PASSWORD })
        await prisma.account.update({ where: { id }, data: { permissions } })
        return id
    }

    it('valeur par défaut de la colonne = rôle joueur du domaine ; inscription → joueur', async () => {
        const raw = await prisma.account.create({ data: { email: emailOf('default'), passwordHash: 'x' } })
        const { id } = await registerAccount.execute({ email: emailOf('registered'), password: PASSWORD })

        expect(raw.permissions).toBe(ROLES.PLAYER)
        expect((await prisma.account.findUniqueOrThrow({ where: { id } })).permissions).toBe(ROLES.PLAYER)
    })

    it('la base refuse un bit inconnu ou un masque négatif (CHECK) ; accepte tous les flags connus', async () => {
        const id = await register('check-bits')

        await expect(prisma.account.update({ where: { id }, data: { permissions: 16 } })).rejects.toThrow()
        await expect(prisma.account.update({ where: { id }, data: { permissions: -1 } })).rejects.toThrow()
        await expect(prisma.account.update({ where: { id }, data: { permissions: ROLES.ADMIN } })).resolves.toBeDefined()
    })

    it('suspension : toutes les sessions révoquées en base, connexion refusée', async () => {
        const adminId = await register('suspend-admin', ROLES.ADMIN)
        const targetId = await register('suspend-target')
        const first = await login.execute({ email: emailOf('suspend-target'), password: PASSWORD })
        await login.execute({ email: emailOf('suspend-target'), password: PASSWORD })

        await suspendAccount.execute({ accountId: adminId, targetAccountId: targetId })

        expect(await prisma.session.count({ where: { accountId: targetId, revokedAt: null } })).toBe(0)
        expect((await prisma.account.findUniqueOrThrow({ where: { id: targetId } })).suspendedAt).not.toBeNull()
        await expect(authenticate.execute(first.accessToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
        await expect(login.execute({ email: emailOf('suspend-target'), password: PASSWORD })).rejects.toMatchObject({
            code: 'INVALID_CREDENTIALS'
        })
    })

    it('suspension et connexion simultanées : jamais de session active sur un compte suspendu', async () => {
        const adminId = await register('race-admin', ROLES.ADMIN)

        for (let round = 0; round < 3; round += 1) {
            const name = `race-target-${round}`
            const targetId = await register(name)

            await Promise.allSettled([
                login.execute({ email: emailOf(name), password: PASSWORD }),
                suspendAccount.execute({ accountId: adminId, targetAccountId: targetId }),
                login.execute({ email: emailOf(name), password: PASSWORD })
            ])

            expect((await prisma.account.findUniqueOrThrow({ where: { id: targetId } })).suspendedAt).not.toBeNull()
            expect(await prisma.session.count({ where: { accountId: targetId, revokedAt: null } })).toBe(0)
        }
    })

    it('retrait de droit : effet immédiat sur un jeton déjà émis', async () => {
        const adminId = await register('demote-admin', ROLES.ADMIN)
        const targetId = await register('demote-target', ROLES.MODERATOR)
        const { accessToken } = await login.execute({ email: emailOf('demote-target'), password: PASSWORD })
        await expect(authenticate.execute(accessToken, 'ACCOUNTS_READ')).resolves.toBeDefined()

        await changeAccountRole.execute({ accountId: adminId, targetAccountId: targetId, role: 'PLAYER' })

        await expect(authenticate.execute(accessToken, 'ACCOUNTS_READ')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('seed : premier administrateur créé une fois, Argon2id ; relancé ou sur un compte existant, rien ne change', async () => {
        const config = { email: Email.create(emailOf('seed-admin')), password: NewPassword.create(PASSWORD) }

        expect(await seedAdminAccount(prisma, config, passwordHasher)).toBe('created')
        const created = await prisma.account.findUniqueOrThrow({ where: { email: config.email.value } })
        expect(created.permissions).toBe(ROLES.ADMIN)
        expect(created.passwordHash).toMatch(/^\$argon2id\$/)
        expect(await passwordHasher.verify(created.passwordHash, PASSWORD)).toBe(true)

        const other = { ...config, password: NewPassword.create('another-password-0123') }
        expect(await seedAdminAccount(prisma, other, passwordHasher)).toBe('unchanged')
        expect(await prisma.account.findUniqueOrThrow({ where: { email: config.email.value } })).toEqual(created)

        // Compte joueur existant : jamais promu par le seed (L7 D9).
        await register('seed-existing')
        const existing = { email: Email.create(emailOf('seed-existing')), password: NewPassword.create(PASSWORD) }
        expect(await seedAdminAccount(prisma, existing, passwordHasher)).toBe('unchanged')
        expect((await prisma.account.findUniqueOrThrow({ where: { email: existing.email.value } })).permissions).toBe(
            ROLES.PLAYER
        )
    })
})
