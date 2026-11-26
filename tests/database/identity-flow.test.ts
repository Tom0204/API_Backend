import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLogin } from '../../src/contexts/identity/app/use-cases/login'
import { createRegisterAccount } from '../../src/contexts/identity/app/use-cases/register-account'
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
    })

    afterAll(async () => {
        await deleteTestAccounts(prisma)
        await prisma.$disconnect()
    })

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

    it('mot de passe haché en Argon2id ; seule l’empreinte SHA-256 du jeton est en base', async () => {
        const email = `hash${TEST_EMAIL_DOMAIN}`
        await registerAccount.execute({ email, password: PASSWORD })

        const { token } = await login.execute({ email, password: PASSWORD })

        const account = await prisma.account.findUniqueOrThrow({ where: { email }, include: { sessions: true } })
        expect(account.passwordHash).toMatch(/^\$argon2id\$/)
        expect(account.sessions).toHaveLength(1)
        expect(account.sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
        const [plainTokenRows] = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) FROM sessions WHERE token_hash = ${token}`
        expect(plainTokenRows?.count).toBe(0n)
    })

    it('la base refuse un email qui n’est pas en minuscules (CHECK)', async () => {
        await expect(
            prisma.account.create({ data: { email: `Upper${TEST_EMAIL_DOMAIN}`, passwordHash: 'x' } })
        ).rejects.toThrow()
    })
})
