import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll } from 'vitest'
import { Email } from '../../src/contexts/identity/domain/email'
import type { PrismaClient } from '../../src/platform/prisma/client'
import { createPrismaUnitOfWork } from '../../src/platform/prisma/prisma-unit-of-work'
import { createEventHandlers } from '../../src/platform/events/event-handlers'
import { createCryptoRandomSource } from '../../src/platform/system/crypto-random-source'
import { type ContractContext, describeIdentityRepositoryContract } from '../contracts/identity-repositories.contract'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

let prisma: PrismaClient
let context: ContractContext

beforeAll(async () => {
    prisma = await connectTestDatabase()
    await deleteTestAccounts(prisma)
    context = {
        unitOfWork: createPrismaUnitOfWork(prisma, createEventHandlers({ random: createCryptoRandomSource() })),
        uniqueEmail: () => Email.create(`${randomUUID()}${TEST_EMAIL_DOMAIN}`)
    }
})

afterAll(async () => {
    await deleteTestAccounts(prisma)
    await prisma.$disconnect()
})

describeIdentityRepositoryContract('Prisma', () => context)
