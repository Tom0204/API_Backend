import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll } from 'vitest'
import { Email } from '../../src/domain/identity/email'
import type { PrismaClient } from '../../src/infrastructure/prisma/client'
import { createPrismaUnitOfWork } from '../../src/infrastructure/prisma/prisma-unit-of-work'
import { type ContractContext, describeIdentityRepositoryContract } from '../contracts/identity-repositories.contract'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

let prisma: PrismaClient
let context: ContractContext

beforeAll(async () => {
    prisma = await connectTestDatabase()
    await deleteTestAccounts(prisma)
    context = {
        unitOfWork: createPrismaUnitOfWork(prisma),
        uniqueEmail: () => Email.create(`${randomUUID()}${TEST_EMAIL_DOMAIN}`)
    }
})

afterAll(async () => {
    await deleteTestAccounts(prisma)
    await prisma.$disconnect()
})

describeIdentityRepositoryContract('Prisma', () => context)
