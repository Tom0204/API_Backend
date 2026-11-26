import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../src/contexts/characters/app/use-cases/create-character'
import { createPlayCombatAction } from '../../src/contexts/combat/app/use-cases/play-combat-action'
import { createStartCombat } from '../../src/contexts/combat/app/use-cases/start-combat'
import type { AppTransaction } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'
import type { PrismaClient } from '../../src/platform/prisma/client'
import { findStartingZoneId } from '../../src/contexts/world/infra/find-starting-zone-id'
import { createPrismaUnitOfWork } from '../../src/platform/prisma/prisma-unit-of-work'
import { seedReferenceData } from '../../src/platform/prisma/seed-reference-data'
import { createSystemClock } from '../../src/platform/system/system-clock'
import { uniqueCharacterName } from '../contracts/character-repositories.contract'
import { describeInventoryRepositoryContract, type InventoryContractContext } from '../contracts/inventory-repositories.contract'
import { withFailingInventorySave } from '../fakes/failing-unit-of-work'
import { FixedRandom } from '../fakes/fake-ports'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

let prisma: PrismaClient
let unitOfWork: UnitOfWork<AppTransaction>
let context: InventoryContractContext
let wolfId: string
let createPlayer: () => Promise<{ accountId: string; characterId: string }>

beforeAll(async () => {
    prisma = await connectTestDatabase()
    await deleteTestAccounts(prisma) // supprime aussi personnages, combats et inventaires (cascade)
    await seedReferenceData(prisma)
    unitOfWork = createPrismaUnitOfWork(prisma)
    const warrior = await prisma.characterClass.findUniqueOrThrow({ where: { code: 'warrior' } })
    const createCharacter = createCreateCharacter({ unitOfWork, startingZoneId: await findStartingZoneId(prisma) })
    wolfId = (await prisma.monsterTemplate.findUniqueOrThrow({ where: { code: 'wolf' } })).id
    createPlayer = async () => {
        const account = await prisma.account.create({ data: { email: `${randomUUID()}${TEST_EMAIL_DOMAIN}`, passwordHash: 'h' } })
        const character = await createCharacter.execute({ accountId: account.id, name: uniqueCharacterName(), classId: warrior.id })
        return { accountId: account.id, characterId: character.id }
    }
    const item = (code: string) => prisma.item.findUniqueOrThrow({ where: { code }, select: { id: true, code: true, name: true } })
    context = {
        unitOfWork,
        createCharacter: async () => (await createPlayer()).characterId,
        items: { pelt: await item('wolf-pelt'), tusk: await item('boar-tusk') }
    }
})

afterAll(async () => {
    await deleteTestAccounts(prisma)
    await prisma.$disconnect()
})

describeInventoryRepositoryContract('Prisma', () => context)

describe('récompenses de victoire sur PostgreSQL', () => {
    const clock = createSystemClock()

    /** Combat contre le loup joué jusqu'à la veille du dernier coup (exemple §8 : 3 actions sur 4). */
    async function combatBeforeFinalBlow(random: FixedRandom) {
        const player = await createPlayer()
        const { combat } = await createStartCombat({ unitOfWork, clock }).execute({ ...player, monsterId: wolfId })
        const play = createPlayCombatAction({ unitOfWork, clock, random })
        for (let i = 0; i < 3; i += 1) await play.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })
        return { player, combatId: combat.id }
    }
    const stateOf = async (characterId: string, combatId: string) => ({
        combat: await prisma.combat.findUniqueOrThrow({ where: { id: combatId }, select: { status: true, monsterHp: true, characterHp: true } }),
        character: await prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { level: true, experience: true } }),
        inventory: await prisma.inventoryItem.findMany({ where: { characterId }, select: { itemId: true, quantity: true } })
    })

    it('victoire : combat, XP et objet validés dans la même transaction', async () => {
        const random = new FixedRandom(0.31)
        const { player, combatId } = await combatBeforeFinalBlow(random)

        const final = await createPlayCombatAction({ unitOfWork, clock, random }).execute({ accountId: player.accountId, combatId, type: 'ATTACK' })

        expect(final.rewards).toMatchObject({ experienceGained: 25, levelsGained: 0 })
        expect(await stateOf(player.characterId, combatId)).toEqual({
            combat: { status: 'VICTORY', monsterHp: 0, characterHp: 92 },
            character: { level: 1, experience: 25 },
            inventory: [{ itemId: context.items.pelt.id, quantity: 1 }]
        })
    })

    it('panne injectée pendant la transaction → rien n’est écrit (combat, XP, inventaire)', async () => {
        const random = new FixedRandom(0.31)
        const { player, combatId } = await combatBeforeFinalBlow(random)
        const before = await stateOf(player.characterId, combatId)

        await expect(
            createPlayCombatAction({ unitOfWork: withFailingInventorySave(unitOfWork), clock, random }).execute({
                accountId: player.accountId,
                combatId,
                type: 'ATTACK'
            })
        ).rejects.toThrow('Panne injectée')

        expect(before.combat.status).toBe('IN_PROGRESS')
        expect(await stateOf(player.characterId, combatId)).toEqual(before)
    })

    it('deux actions finales simultanées → une seule attribution (verrou sur le combat)', async () => {
        const random = new FixedRandom(0.31)
        const { player, combatId } = await combatBeforeFinalBlow(random)
        const play = createPlayCombatAction({ unitOfWork, clock, random })

        const results = await Promise.allSettled([
            play.execute({ accountId: player.accountId, combatId, type: 'ATTACK' }),
            play.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })
        ])

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'COMBAT_FINISHED' } })
        expect(await stateOf(player.characterId, combatId)).toMatchObject({
            character: { level: 1, experience: 25 },
            inventory: [{ itemId: context.items.pelt.id, quantity: 1 }]
        })
    })

    it('la base refuse une quantité nulle ou négative (CHECK)', async () => {
        const { characterId } = await createPlayer()

        for (const quantity of [0, -1]) {
            await expect(
                prisma.inventoryItem.create({ data: { characterId, itemId: context.items.pelt.id, quantity } })
            ).rejects.toThrow()
        }
    })
})
