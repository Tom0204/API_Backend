import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLogin } from '../../src/contexts/identity/app/use-cases/login'
import { createLogout } from '../../src/contexts/identity/app/use-cases/logout'
import { createAuthenticate } from '../../src/contexts/identity/app/use-cases/authenticate'
import { createRefreshSession } from '../../src/contexts/identity/app/use-cases/refresh-session'
import { createRegisterAccount } from '../../src/contexts/identity/app/use-cases/register-account'
import { MAX_FAILED_LOGIN_ATTEMPTS } from '../../src/contexts/identity/domain/account'
import type { PrismaClient } from '../../src/platform/prisma/client'
import { createPrismaUnitOfWork } from '../../src/platform/prisma/prisma-unit-of-work'
import { createEventHandlers } from '../../src/platform/events/event-handlers'
import { createCryptoRandomSource } from '../../src/platform/system/crypto-random-source'
import { createArgon2PasswordHasher } from '../../src/contexts/identity/infra/argon2-password-hasher'
import { createCryptoTokenGenerator } from '../../src/contexts/identity/infra/crypto-token-generator'
import { createSystemClock } from '../../src/platform/system/system-clock'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

const PASSWORD = 'correct-horse-battery-staple'

describe('identité sur PostgreSQL (implémentations réelles)', () => {
    let prisma: PrismaClient
    let registerAccount: ReturnType<typeof createRegisterAccount>
    let login: ReturnType<typeof createLogin>
    let refreshSession: ReturnType<typeof createRefreshSession>
    let logout: ReturnType<typeof createLogout>
    let authenticate: ReturnType<typeof createAuthenticate>

    beforeAll(async () => {
        prisma = await connectTestDatabase()
        await deleteTestAccounts(prisma)
        const deps = {
            unitOfWork: createPrismaUnitOfWork(prisma, createEventHandlers({ random: createCryptoRandomSource() })),
            passwordHasher: createArgon2PasswordHasher(),
            tokenGenerator: createCryptoTokenGenerator(),
            clock: createSystemClock()
        }
        registerAccount = createRegisterAccount(deps)
        login = createLogin(deps)
        refreshSession = createRefreshSession(deps)
        logout = createLogout(deps)
        authenticate = createAuthenticate(deps)
    })

    afterAll(async () => {
        await deleteTestAccounts(prisma)
        await prisma.$disconnect()
    })

    async function registerAndLogin(name: string) {
        const email = `${name}${TEST_EMAIL_DOMAIN}`
        await registerAccount.execute({ email, password: PASSWORD })
        return { email, tokens: await login.execute({ email, password: PASSWORD }) }
    }

    it('2 inscriptions simultanées du même email → exactement 1 compte, 1 EMAIL_ALREADY_USED', async () => {
        const email = `race${TEST_EMAIL_DOMAIN}`

        const results = await Promise.allSettled([
            registerAccount.execute({ email, password: PASSWORD }),
            registerAccount.execute({ email: email.toUpperCase(), password: PASSWORD })
        ])

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((result) => result.status === 'rejected')).toMatchObject({
            reason: { code: 'EMAIL_ALREADY_USED' }
        })
        expect(await prisma.account.count({ where: { email } })).toBe(1)
    })

    it('mot de passe haché en Argon2id ; seules les empreintes SHA-256 des deux jetons sont en base', async () => {
        const { email, tokens } = await registerAndLogin('hash')

        const account = await prisma.account.findUniqueOrThrow({
            where: { email },
            include: { sessions: { include: { refreshTokens: true } } }
        })
        expect(account.passwordHash).toMatch(/^\$argon2id\$/)
        expect(account.sessions).toHaveLength(1)
        expect(account.sessions[0]?.accessTokenHash).toMatch(/^[0-9a-f]{64}$/)
        expect(account.sessions[0]?.refreshTokens).toHaveLength(1)
        expect(account.sessions[0]?.refreshTokens[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
        for (const token of [tokens.accessToken, tokens.refreshToken]) {
            expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
            const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT (SELECT count(*) FROM sessions WHERE access_token_hash = ${token})
                     + (SELECT count(*) FROM refresh_tokens WHERE token_hash = ${token}) AS count`
            expect(row?.count).toBe(0n)
        }
    })

    it('2 rafraîchissements simultanés du même jeton → 1 seul succès, 1 × 401, famille révoquée', async () => {
        const { email, tokens } = await registerAndLogin('refresh-race')

        const results = await Promise.allSettled([
            refreshSession.execute({ refreshToken: tokens.refreshToken }),
            refreshSession.execute({ refreshToken: tokens.refreshToken })
        ])

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((result) => result.status === 'rejected')).toMatchObject({
            reason: { code: 'UNAUTHENTICATED' }
        })
        const sessions = await prisma.session.findMany({ where: { account: { email } }, include: { refreshTokens: true } })
        expect(sessions).toHaveLength(1)
        expect(sessions[0]?.revokedAt).not.toBeNull() // la seconde requête a vu le jeton consommé : réutilisation
        expect(sessions[0]?.refreshTokens).toHaveLength(2) // un seul nouveau jeton émis
    })

    it('réutilisation : la révocation est validée en base malgré le 401', async () => {
        const { email, tokens } = await registerAndLogin('reuse')
        const second = await refreshSession.execute({ refreshToken: tokens.refreshToken })

        await expect(refreshSession.execute({ refreshToken: tokens.refreshToken })).rejects.toMatchObject({
            code: 'UNAUTHENTICATED'
        })

        const session = await prisma.session.findFirstOrThrow({ where: { account: { email } } })
        expect(session.revokedAt).not.toBeNull()
        await expect(authenticate.execute(second.accessToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    })

    it('déconnexion : la session courante est révoquée, pas les autres', async () => {
        const { email, tokens } = await registerAndLogin('logout')
        const other = await login.execute({ email, password: PASSWORD })

        await logout.execute(await authenticate.execute(tokens.accessToken))

        await expect(authenticate.execute(tokens.accessToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
        await expect(refreshSession.execute({ refreshToken: tokens.refreshToken })).rejects.toMatchObject({
            code: 'UNAUTHENTICATED'
        })
        await expect(authenticate.execute(other.accessToken)).resolves.toBeDefined()
    })

    it('échecs de connexion simultanés : tous comptés, compte verrouillé', async () => {
        const email = `lock-race${TEST_EMAIL_DOMAIN}`
        await registerAccount.execute({ email, password: PASSWORD })

        const results = await Promise.allSettled(
            Array.from({ length: MAX_FAILED_LOGIN_ATTEMPTS + 2 }, () => login.execute({ email, password: 'wrong-password' }))
        )

        expect(results.every((result) => result.status === 'rejected')).toBe(true)
        const account = await prisma.account.findUniqueOrThrow({ where: { email } })
        // Les tentatives arrivées après le verrouillage ne sont ni comptées ni prolongeantes (L6 D7).
        expect(account.failedLoginCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS)
        expect(account.lockedUntil).not.toBeNull()
        await expect(login.execute({ email, password: PASSWORD })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    })

    it('la base refuse un email qui n’est pas en minuscules (CHECK)', async () => {
        await expect(
            prisma.account.create({ data: { email: `Upper${TEST_EMAIL_DOMAIN}`, passwordHash: 'x' } })
        ).rejects.toThrow()
    })

    it('la base refuse un compteur négatif et un jeton d’accès qui dépasse la famille (CHECK)', async () => {
        const { email } = await registerAndLogin('checks')
        const session = await prisma.session.findFirstOrThrow({ where: { account: { email } } })

        await expect(prisma.account.update({ where: { email }, data: { failedLoginCount: -1 } })).rejects.toThrow()
        await expect(
            prisma.session.update({
                where: { id: session.id },
                data: { accessExpiresAt: new Date(session.expiresAt.getTime() + 1) }
            })
        ).rejects.toThrow()
    })
})
