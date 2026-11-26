import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../../../src/contexts/characters/app/use-cases/create-character'
import { createPlayCombatAction } from '../../../../src/contexts/combat/app/use-cases/play-combat-action'
import { createStartCombat } from '../../../../src/contexts/combat/app/use-cases/start-combat'
import { Account } from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'
import { createEventHandlers } from '../../../../src/platform/events/event-handlers'
import type { EventHandler } from '../../../../src/shared/app/event-publisher'
import type { AppTransaction } from '../../../../src/platform/transaction'
import { withFailingInventorySave } from '../../../fakes/failing-unit-of-work'
import { FixedClock, FixedRandom } from '../../../fakes/fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

function setup(database = new InMemoryDatabase()) {
    const clock = new FixedClock()
    const createCharacter = createCreateCharacter({ unitOfWork: database, startingZoneId: IN_MEMORY_STARTING_ZONE_ID, clock })
    const startCombat = createStartCombat({ unitOfWork: database, clock })
    const playCombatAction = createPlayCombatAction({ unitOfWork: database, clock })
    const newPlayer = async () => {
        const accountId = (
            await database.run(({ accounts }) =>
                accounts.insert(Account.create({ email: Email.create(`${randomUUID()}@example.com`), passwordHash: 'h' }))
            )
        ).id
        const character = await createCharacter.execute({ accountId, name: 'Thrall', classId: database.classId('warrior') })
        return { accountId, characterId: character.id }
    }
    const journalOf = (characterId: string) =>
        database.state.gameEvents.filter((entry) => entry.characterId === characterId).sort((a, b) => a.seq - b.seq)
    return { database, clock, createCharacter, startCombat, playCombatAction, newPlayer, journalOf }
}

describe('EVT-03 — journal des événements de jeu', () => {
    it('parcours complet : création, combat de l’exemple §8, victoire, XP et butin, dans l’ordre', async () => {
        const ctx = setup(new InMemoryDatabase({ random: new FixedRandom(0.31) }))
        const player = await ctx.newPlayer()
        const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('wolf') })
        for (let i = 0; i < 4; i += 1) await ctx.playCombatAction.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })

        const journal = ctx.journalOf(player.characterId)

        expect(journal.map((entry) => entry.type)).toEqual([
            'CharacterCreated',
            'CombatStarted',
            'CombatTurnPlayed', // ouverture du loup
            ...Array(3).fill(['CombatTurnPlayed', 'CombatTurnPlayed']).flat(),
            'CombatTurnPlayed', // dernier coup du guerrier
            'CombatWon',
            'ExperienceGranted',
            'LootAwarded'
        ])
        expect(journal.at(-5)).toMatchObject({ combatId: combat.id, payload: { attacker: 'MONSTER', damage: 7, characterHp: 92, monsterHp: 7 } })
        expect(journal.at(-4)?.payload).toEqual({ attacker: 'CHARACTER', damage: 11, characterHp: 92, monsterHp: 0 })
        expect(journal.at(-2)?.payload).toMatchObject({ amount: 25, level: 1, experience: 25 })
        expect(journal.at(-1)?.payload).toEqual({ item: { id: ctx.database.item('wolf-pelt').id, code: 'wolf-pelt', name: 'Peau de loup' }, quantity: 1 })
        expect(journal.every((entry) => entry.occurredAt.getTime() === ctx.clock.now().getTime())).toBe(true)
    })

    it('passage de niveau journalisé après le gain d’XP', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        const record = ctx.database.state.characters.find((c) => c.id === player.characterId)
        if (record) record.experience = 90
        const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('wolf') })
        for (let i = 0; i < 4; i += 1) await ctx.playCombatAction.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })

        const types = ctx.journalOf(player.characterId).map((entry) => entry.type)

        expect(types.slice(-3)).toEqual(['CombatWon', 'ExperienceGranted', 'CharacterLeveledUp'])
        expect(ctx.journalOf(player.characterId).at(-1)?.payload).toEqual({ level: 2, levelsGained: 1 })
    })

    it('défaite : CombatLost, ni XP ni butin', async () => {
        const ctx = setup()
        const accountId = (await ctx.newPlayer()).accountId
        const mage = await ctx.createCharacter.execute({ accountId, name: 'Jaina', classId: ctx.database.classId('mage') })
        const { combat } = await ctx.startCombat.execute({ accountId, characterId: mage.id, monsterId: ctx.database.monsterId('bandit') })
        let status = 'IN_PROGRESS'
        while (status === 'IN_PROGRESS') {
            status = (await ctx.playCombatAction.execute({ accountId, combatId: combat.id, type: 'ATTACK' })).combat.status
        }

        const types = ctx.journalOf(mage.id).map((entry) => entry.type)

        expect(types.at(-1)).toBe('CombatLost')
        expect(types).not.toContain('ExperienceGranted')
        expect(types).not.toContain('LootAwarded')
    })

    it('aucune donnée sensible : ni compte, ni email, ni mot de passe dans le journal', async () => {
        const ctx = setup(new InMemoryDatabase({ random: new FixedRandom(0.31) }))
        const player = await ctx.newPlayer()
        const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('wolf') })
        for (let i = 0; i < 4; i += 1) await ctx.playCombatAction.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })

        const serialized = JSON.stringify(ctx.journalOf(player.characterId))

        expect(serialized).not.toContain(player.accountId)
        expect(serialized).not.toMatch(/accountId|email|password|hash|token/i)
    })

    it('panne injectée à la fin du combat : le journal de l’action est annulé avec la transaction', async () => {
        const ctx = setup(new InMemoryDatabase({ random: new FixedRandom(0.31) }))
        const player = await ctx.newPlayer()
        const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('wolf') })
        for (let i = 0; i < 3; i += 1) await ctx.playCombatAction.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })
        const before = ctx.journalOf(player.characterId).length
        const failing = createPlayCombatAction({ unitOfWork: withFailingInventorySave(ctx.database, ctx.database.handlers), clock: ctx.clock })

        await expect(failing.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })).rejects.toThrow('Panne injectée')

        expect(ctx.journalOf(player.characterId)).toHaveLength(before)
        expect(ctx.journalOf(player.characterId).map((entry) => entry.type)).not.toContain('CombatWon')
    })

    it('un handler en échec annule toute la transaction (EVT-01) : ni personnage ni journal', async () => {
        const failing: EventHandler<AppTransaction> = {
            name: 'test.failing',
            eventTypes: ['CharacterCreated'],
            handle: async () => {
                throw new Error('handler en échec')
            }
        }
        const random = new FixedRandom()
        const database = new InMemoryDatabase({ random, handlers: [...createEventHandlers({ random }), failing] })
        const ctx = setup(database)

        await expect(ctx.newPlayer()).rejects.toThrow('handler en échec')

        expect(database.state.characters).toEqual([])
        expect(database.state.gameEvents).toEqual([])
    })
})
