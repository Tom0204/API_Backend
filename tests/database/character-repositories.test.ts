import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../src/application/characters/create-character'
import type { PrismaClient } from '../../src/infrastructure/prisma/client'
import { findStartingZoneId } from '../../src/infrastructure/prisma/find-starting-zone-id'
import { createPrismaUnitOfWork } from '../../src/infrastructure/prisma/prisma-unit-of-work'
import { seedReferenceData } from '../../src/infrastructure/prisma/seed-reference-data'
import {
    type CharacterContractContext,
    describeCharacterRepositoryContract,
    uniqueCharacterName
} from '../contracts/character-repositories.contract'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

let prisma: PrismaClient
let context: CharacterContractContext

beforeAll(async () => {
    prisma = await connectTestDatabase()
    await deleteTestAccounts(prisma) // supprime aussi leurs personnages (cascade)
    await seedReferenceData(prisma) // idempotent : indépendant de l'ordre des fichiers
    const warrior = await prisma.characterClass.findUniqueOrThrow({ where: { code: 'warrior' } })
    context = {
        unitOfWork: createPrismaUnitOfWork(prisma),
        createAccount: async () =>
            (await prisma.account.create({ data: { email: `${randomUUID()}${TEST_EMAIL_DOMAIN}`, passwordHash: 'h' } })).id,
        warriorClassId: warrior.id,
        startingZoneId: await findStartingZoneId(prisma)
    }
})

afterAll(async () => {
    await deleteTestAccounts(prisma)
    await prisma.$disconnect()
})

describeCharacterRepositoryContract('Prisma', () => context)

describe('création de personnages sur PostgreSQL (concurrence)', () => {
    it('8 créations simultanées pour un même compte → exactement 5 (verrou sur le compte)', async () => {
        const accountId = await context.createAccount()
        const createCharacter = createCreateCharacter({ unitOfWork: context.unitOfWork, startingZoneId: context.startingZoneId })

        const results = await Promise.allSettled(
            Array.from({ length: 8 }, () =>
                createCharacter.execute({ accountId, name: uniqueCharacterName(), classId: context.warriorClassId })
            )
        )

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
        expect(results.filter((r) => r.status === 'rejected').map((r) => r.reason.code)).toEqual(
            Array(3).fill('CHARACTER_LIMIT_REACHED')
        )
        expect(await prisma.character.count({ where: { accountId } })).toBe(5)
    })

    it('même nom (casse différente) créé en même temps par deux comptes → 1 seul', async () => {
        const [alice, bob] = [await context.createAccount(), await context.createAccount()]
        const createCharacter = createCreateCharacter({ unitOfWork: context.unitOfWork, startingZoneId: context.startingZoneId })
        const name = uniqueCharacterName()

        const results = await Promise.allSettled([
            createCharacter.execute({ accountId: alice, name, classId: context.warriorClassId }),
            createCharacter.execute({ accountId: bob, name: name.toUpperCase(), classId: context.warriorClassId })
        ])

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'CHARACTER_NAME_TAKEN' } })
        const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) FROM characters WHERE lower(name) = ${name.toLowerCase()}`
        expect(row?.count).toBe(1n)
    })

    it('la base refuse un niveau hors bornes ou de l’XP au niveau 10 (CHECK)', async () => {
        const accountId = await context.createAccount()
        const base = { accountId, classId: context.warriorClassId, zoneId: context.startingZoneId }

        await expect(prisma.character.create({ data: { ...base, name: uniqueCharacterName(), level: 11 } })).rejects.toThrow()
        await expect(
            prisma.character.create({ data: { ...base, name: uniqueCharacterName(), level: 10, experience: 5 } })
        ).rejects.toThrow()
    })
})
