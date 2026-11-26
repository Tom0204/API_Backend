import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../src/contexts/characters/app/use-cases/create-character'
import { createGetCombatHistory } from '../../src/contexts/combat/app/use-cases/get-combat-history'
import { createPlayCombatAction } from '../../src/contexts/combat/app/use-cases/play-combat-action'
import { createStartCombat } from '../../src/contexts/combat/app/use-cases/start-combat'
import { findStartingZoneId } from '../../src/contexts/world/infra/find-starting-zone-id'
import { createEventHandlers } from '../../src/platform/events/event-handlers'
import type { PrismaClient } from '../../src/platform/prisma/client'
import { createPrismaUnitOfWork } from '../../src/platform/prisma/prisma-unit-of-work'
import { seedReferenceData } from '../../src/platform/prisma/seed-reference-data'
import { createSystemClock } from '../../src/platform/system/system-clock'
import type { AppTransaction } from '../../src/platform/transaction'
import type { EventHandler } from '../../src/shared/app/event-publisher'
import { uniqueCharacterName } from '../contracts/character-repositories.contract'
import { describeJournalRepositoryContract, type JournalContractContext } from '../contracts/journal-repositories.contract'
import { FixedRandom } from '../fakes/fake-ports'
import { connectTestDatabase, deleteTestAccounts, TEST_EMAIL_DOMAIN } from './test-database'

let prisma: PrismaClient
let context: JournalContractContext
let startingZoneId: string
let warriorId: string
let monsterIds: Record<'wolf' | 'boar', string>
const clock = createSystemClock()

async function newAccount(): Promise<string> {
    return (await prisma.account.create({ data: { email: `${randomUUID()}${TEST_EMAIL_DOMAIN}`, passwordHash: 'h' } })).id
}

beforeAll(async () => {
    prisma = await connectTestDatabase()
    await deleteTestAccounts(prisma) // supprime aussi personnages, combats et journal (cascade)
    await seedReferenceData(prisma)
    startingZoneId = await findStartingZoneId(prisma)
    warriorId = (await prisma.characterClass.findUniqueOrThrow({ where: { code: 'warrior' } })).id
    monsterIds = {
        wolf: (await prisma.monsterTemplate.findUniqueOrThrow({ where: { code: 'wolf' } })).id,
        boar: (await prisma.monsterTemplate.findUniqueOrThrow({ where: { code: 'boar' } })).id
    }
    const unitOfWork = createPrismaUnitOfWork(prisma, createEventHandlers({ random: new FixedRandom() }))
    context = {
        unitOfWork,
        createCharacterWithCombat: async () => {
            const accountId = await newAccount()
            const character = await createCreateCharacter({ unitOfWork, startingZoneId, clock }).execute({
                accountId,
                name: uniqueCharacterName(),
                classId: warriorId
            })
            const { combat } = await createStartCombat({ unitOfWork, clock }).execute({ accountId, characterId: character.id, monsterId: monsterIds.boar })
            // Le contrat part d'un journal vide : on retire les entrées produites par la création et le démarrage.
            await prisma.gameEvent.deleteMany({ where: { characterId: character.id } })
            return { characterId: character.id, combatId: combat.id }
        }
    }
})

afterAll(async () => {
    await deleteTestAccounts(prisma)
    await prisma.$disconnect()
})

describeJournalRepositoryContract('Prisma', () => context)

describe('journal et événements sur PostgreSQL (EVT-01, EVT-03)', () => {
    it('parcours du loup : journal complet dans l’ordre, écrit dans les mêmes transactions', async () => {
        const unitOfWork = createPrismaUnitOfWork(prisma, createEventHandlers({ random: new FixedRandom(0.31) }))
        const accountId = await newAccount()
        const character = await createCreateCharacter({ unitOfWork, startingZoneId, clock }).execute({ accountId, name: uniqueCharacterName(), classId: warriorId })
        const { combat } = await createStartCombat({ unitOfWork, clock }).execute({ accountId, characterId: character.id, monsterId: monsterIds.wolf })
        const play = createPlayCombatAction({ unitOfWork, clock })
        for (let i = 0; i < 4; i += 1) await play.execute({ accountId, combatId: combat.id, type: 'ATTACK' })

        const entries = await unitOfWork.run(({ journal }) => journal.findByCharacter(character.id))

        expect(entries.map((entry) => entry.type)).toEqual([
            'CharacterCreated',
            'CombatStarted',
            ...Array(7).fill('CombatTurnPlayed'),
            'CombatTurnPlayed',
            'CombatWon',
            'ExperienceGranted',
            'LootAwarded'
        ])
        expect(entries.at(-4)?.payload).toEqual({ attacker: 'CHARACTER', damage: 11, characterHp: 92, monsterHp: 0 })
    })

    it('historique du loup (PROD-01, exemple §8) : 8 coups dans l’ordre malgré des dates identiques', async () => {
        const unitOfWork = createPrismaUnitOfWork(prisma, createEventHandlers({ random: new FixedRandom() }))
        const accountId = await newAccount()
        const character = await createCreateCharacter({ unitOfWork, startingZoneId, clock }).execute({ accountId, name: uniqueCharacterName(), classId: warriorId })
        const { combat } = await createStartCombat({ unitOfWork, clock }).execute({ accountId, characterId: character.id, monsterId: monsterIds.wolf })
        const play = createPlayCombatAction({ unitOfWork, clock })
        for (let i = 0; i < 4; i += 1) await play.execute({ accountId, combatId: combat.id, type: 'ATTACK' })

        const history = await createGetCombatHistory({ unitOfWork }).execute({ accountId, combatId: combat.id })
        const stranger = await newAccount()

        expect(history.status).toBe('VICTORY')
        expect(history.turns.map(({ attacker, characterHp, monsterHp }) => [attacker, characterHp, monsterHp])).toEqual([
            ['MONSTER', 113, 40],
            ['CHARACTER', 113, 29],
            ['MONSTER', 106, 29],
            ['CHARACTER', 106, 18],
            ['MONSTER', 99, 18],
            ['CHARACTER', 99, 7],
            ['MONSTER', 92, 7],
            ['CHARACTER', 92, 0]
        ])
        await expect(
            createGetCombatHistory({ unitOfWork }).execute({ accountId: stranger, combatId: combat.id })
        ).rejects.toMatchObject({ code: 'COMBAT_NOT_FOUND' })
    })

    it('un handler en échec annule toute la transaction : ni personnage ni journal', async () => {
        const random = new FixedRandom()
        const failing: EventHandler<AppTransaction> = {
            name: 'test.failing',
            eventTypes: ['CharacterCreated'],
            handle: async () => {
                throw new Error('handler en échec')
            }
        }
        const unitOfWork = createPrismaUnitOfWork(prisma, [...createEventHandlers({ random }), failing])
        const accountId = await newAccount()

        await expect(
            createCreateCharacter({ unitOfWork, startingZoneId, clock }).execute({ accountId, name: uniqueCharacterName(), classId: warriorId })
        ).rejects.toThrow('handler en échec')

        expect(await prisma.character.count({ where: { accountId } })).toBe(0)
        expect(await prisma.gameEvent.count({ where: { character: { accountId } } })).toBe(0)
    })

    it('la base refuse des données qui ne sont pas un objet JSON (CHECK)', async () => {
        const { characterId } = await context.createCharacterWithCombat()

        await expect(
            prisma.gameEvent.create({ data: { type: 'CombatStarted', characterId, payload: [1, 2], occurredAt: new Date() } })
        ).rejects.toThrow()
    })
})
