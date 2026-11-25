import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../src/application/characters/create-character'
import { createPlayCombatAction } from '../../src/application/combat/play-combat-action'
import { createStartCombat } from '../../src/application/combat/start-combat'
import type { PrismaClient } from '../../src/infrastructure/prisma/client'
import { findStartingZoneId } from '../../src/infrastructure/prisma/find-starting-zone-id'
import { createPrismaUnitOfWork } from '../../src/infrastructure/prisma/prisma-unit-of-work'
import { seedReferenceData } from '../../src/infrastructure/prisma/seed-reference-data'
import { createSystemClock } from '../../src/infrastructure/system/system-clock'
import { uniqueCharacterName } from '../contracts/character-repositories.contract'
import { type CombatContractContext, describeCombatRepositoryContract } from '../contracts/combat-repositories.contract'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

let prisma: PrismaClient
let context: CombatContractContext
let createPlayer: () => Promise<{ accountId: string; characterId: string }>
let monsterIds: Record<'wolf' | 'boar', string>

beforeAll(async () => {
    prisma = await connectTestDatabase()
    await deleteTestAccounts(prisma) // supprime aussi personnages et combats (cascade)
    await seedReferenceData(prisma)
    const unitOfWork = createPrismaUnitOfWork(prisma)
    const startingZoneId = await findStartingZoneId(prisma)
    const warrior = await prisma.characterClass.findUniqueOrThrow({ where: { code: 'warrior' } })
    const createCharacter = createCreateCharacter({ unitOfWork, startingZoneId })
    monsterIds = {
        wolf: (await prisma.monsterTemplate.findUniqueOrThrow({ where: { code: 'wolf' } })).id,
        boar: (await prisma.monsterTemplate.findUniqueOrThrow({ where: { code: 'boar' } })).id
    }
    createPlayer = async () => {
        const account = await prisma.account.create({ data: { email: `${randomUUID()}${TEST_EMAIL_DOMAIN}`, passwordHash: 'h' } })
        const character = await createCharacter.execute({ accountId: account.id, name: uniqueCharacterName(), classId: warrior.id })
        return { accountId: account.id, characterId: character.id }
    }
    context = {
        unitOfWork,
        createCharacter: async () => (await createPlayer()).characterId,
        startingZoneId,
        wolfId: monsterIds.wolf
    }
})

afterAll(async () => {
    await deleteTestAccounts(prisma)
    await prisma.$disconnect()
})

describeCombatRepositoryContract('Prisma', () => context)

describe('combat sur PostgreSQL (concurrence)', () => {
    const deps = () => ({ unitOfWork: context.unitOfWork, clock: createSystemClock() })

    it('2 démarrages simultanés pour le même personnage → 1 seul combat', async () => {
        const player = await createPlayer()
        const startCombat = createStartCombat(deps())

        const results = await Promise.allSettled([
            startCombat.execute({ ...player, monsterId: monsterIds.boar }),
            startCombat.execute({ ...player, monsterId: monsterIds.wolf })
        ])

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'CHARACTER_ALREADY_IN_COMBAT' } })
        expect(await prisma.combat.count({ where: { characterId: player.characterId } })).toBe(1)
    })

    it('2 actions simultanées s’exécutent l’une après l’autre (verrou sur le combat)', async () => {
        const player = await createPlayer()
        const { combat } = await createStartCombat(deps()).execute({ ...player, monsterId: monsterIds.boar })
        const playCombatAction = createPlayCombatAction(deps())

        const results = await Promise.allSettled([
            playCombatAction.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' }),
            playCombatAction.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })
        ])

        expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
        const row = await prisma.combat.findUniqueOrThrow({ where: { id: combat.id } })
        expect([row.monsterHp, row.characterHp]).toEqual([60 - 2 * 11, 120 - 2 * 9])
    })

    it('la base refuse un statut incohérent avec les PV (CHECK)', async () => {
        const player = await createPlayer()
        const { combat } = await createStartCombat(deps()).execute({ ...player, monsterId: monsterIds.boar })

        await expect(prisma.combat.update({ where: { id: combat.id }, data: { status: 'VICTORY', finishedAt: new Date() } })).rejects.toThrow()
        await expect(prisma.combat.update({ where: { id: combat.id }, data: { monsterHp: 999 } })).rejects.toThrow()
    })
})
