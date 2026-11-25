import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../../../src/application/characters/create-character'
import { createGetMyCombat } from '../../../../src/application/combat/get-my-combat'
import { createPlayCombatAction } from '../../../../src/application/combat/play-combat-action'
import { createStartCombat } from '../../../../src/application/combat/start-combat'
import { createGetMyInventory } from '../../../../src/application/inventory/get-my-inventory'
import type { UnitOfWork } from '../../../../src/application/ports/unit-of-work'
import { Account } from '../../../../src/domain/identity/account'
import { Email } from '../../../../src/domain/identity/email'
import { withFailingInventorySave } from '../../../fakes/failing-unit-of-work'
import { FixedClock, FixedRandom } from '../../../fakes/fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

function setup() {
    const database = new InMemoryDatabase()
    const clock = new FixedClock()
    const random = new FixedRandom()
    const deps = { unitOfWork: database, clock, random }
    const createCharacter = createCreateCharacter({ unitOfWork: database, startingZoneId: IN_MEMORY_STARTING_ZONE_ID })
    const startCombat = createStartCombat(deps)
    const playCombatAction = createPlayCombatAction(deps)

    const newPlayer = async (classCode = 'warrior') => {
        const accountId = (
            await database.run(({ accounts }) =>
                accounts.insert(Account.create({ email: Email.create(`${randomUUID()}@example.com`), passwordHash: 'h' }))
            )
        ).id
        const letters = randomUUID().replace(/[^a-f]/g, '').slice(0, 10)
        const character = await createCharacter.execute({ accountId, name: `Hero${letters}`, classId: database.classId(classCode) })
        return { accountId, characterId: character.id }
    }
    const record = (characterId: string) => {
        const found = database.state.characters.find((c) => c.id === characterId)
        if (!found) throw new Error('personnage absent')
        return found
    }
    /** Démarre un combat et joue jusqu'à la veille du dernier coup (loup : 3 actions sur 4, exemple §8). */
    const combatBeforeFinalBlow = async (player: { accountId: string; characterId: string }) => {
        const { combat } = await startCombat.execute({ ...player, monsterId: database.monsterId('wolf') })
        for (let i = 0; i < 3; i += 1) await playCombatAction.execute({ accountId: player.accountId, combatId: combat.id, type: 'ATTACK' })
        return combat.id
    }
    const playUntilFinished = async (player: { accountId: string }, combatId: string, action = playCombatAction) => {
        let view = await action.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })
        while (view.combat.snapshot.status === 'IN_PROGRESS') {
            view = await action.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })
        }
        return view
    }
    const inventoryOf = (characterId: string) =>
        database.state.inventoryItems.filter((item) => item.characterId === characterId).map(({ itemId, quantity }) => ({ itemId, quantity }))
    const playWith = (unitOfWork: UnitOfWork) => createPlayCombatAction({ unitOfWork, clock, random })

    return {
        database,
        random,
        newPlayer,
        record,
        startCombat,
        playCombatAction,
        combatBeforeFinalBlow,
        playUntilFinished,
        inventoryOf,
        playWith,
        getMyCombat: createGetMyCombat(deps),
        getMyInventory: createGetMyInventory(deps)
    }
}

describe('REWARD-01 — récompenses de victoire', () => {
    it('exemple §8 complet : loup battu en 4 actions, 92 PV, 25 XP ; tirage 0,31 → Peau de loup', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        ctx.random.value = 0.31
        const combatId = await ctx.combatBeforeFinalBlow(player)
        expect(ctx.random.draws).toBe(0) // aucun tirage avant la victoire

        const final = await ctx.playCombatAction.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })

        expect(final.combat.snapshot.status).toBe('VICTORY')
        expect(final.combat.snapshot.character.hp).toBe(92)
        expect(final.rewards).toMatchObject({ experienceGained: 25, levelsGained: 0, progression: { level: 1, experience: 25 } })
        expect(final.rewards?.item).toMatchObject({ item: { code: 'wolf-pelt', name: 'Peau de loup' }, quantity: 1 })
        expect(ctx.random.draws).toBe(1)
        expect(ctx.record(player.characterId)).toMatchObject({ level: 1, experience: 25 })
        expect(ctx.inventoryOf(player.characterId)).toEqual([{ itemId: ctx.database.item('wolf-pelt').id, quantity: 1 }])
    })

    it('tirage 0,9 → aucun objet, l’XP est attribuée', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        ctx.random.value = 0.9
        const combatId = await ctx.combatBeforeFinalBlow(player)

        const final = await ctx.playCombatAction.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })

        expect(final.rewards).toMatchObject({ experienceGained: 25, item: null })
        expect(ctx.record(player.characterId).experience).toBe(25)
        expect(ctx.inventoryOf(player.characterId)).toEqual([])
    })

    it('passage de niveau : niveau 1 avec 90 XP + bandit (60 XP) → niveau 2 avec 50 XP', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        ctx.record(player.characterId).experience = 90
        const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('bandit') })

        const final = await ctx.playUntilFinished(player, combat.id)

        expect(final.combat.snapshot.status).toBe('VICTORY')
        expect(final.rewards).toMatchObject({ experienceGained: 60, levelsGained: 1, progression: { level: 2, experience: 50 } })
        expect(ctx.record(player.characterId)).toMatchObject({ level: 2, experience: 50 })
    })

    it('niveau 10 : XP ignorée (rules.md §5), butin toujours tiré', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        Object.assign(ctx.record(player.characterId), { level: 10, experience: 0 })
        ctx.random.value = 0.31
        const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('wolf') })

        const final = await ctx.playUntilFinished(player, combat.id)

        expect(final.rewards).toMatchObject({ levelsGained: 0, progression: { level: 10, experience: 0 } })
        expect(final.rewards?.item?.item.code).toBe('wolf-pelt')
        expect(ctx.record(player.characterId)).toMatchObject({ level: 10, experience: 0 })
    })

    it('défaite → ni XP, ni butin, aucun tirage (rules.md §7)', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer('mage')
        ctx.random.value = 0
        const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('bandit') })

        const final = await ctx.playUntilFinished(player, combat.id)

        expect(final.combat.snapshot.status).toBe('DEFEAT')
        expect(final.rewards).toBeNull()
        expect(ctx.random.draws).toBe(0)
        expect(ctx.record(player.characterId)).toMatchObject({ level: 1, experience: 0 })
        expect(ctx.inventoryOf(player.characterId)).toEqual([])
    })

    it('action non finale, démarrage et consultation : rewards null', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        const started = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('wolf') })
        const turn = await ctx.playCombatAction.execute({ accountId: player.accountId, combatId: started.combat.id, type: 'ATTACK' })
        const consulted = await ctx.getMyCombat.execute({ accountId: player.accountId, combatId: started.combat.id })

        expect([started.rewards, turn.rewards, consulted.rewards]).toEqual([null, null, null])
    })

    it('panne injectée pendant la transaction → rien n’est écrit ; la nouvelle tentative attribue une seule fois', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        ctx.random.value = 0.31
        const combatId = await ctx.combatBeforeFinalBlow(player)
        const before = structuredClone(ctx.database.state.combats.find((c) => c.id === combatId))

        await expect(
            ctx.playWith(withFailingInventorySave(ctx.database)).execute({ accountId: player.accountId, combatId, type: 'ATTACK' })
        ).rejects.toThrow('Panne injectée')

        expect(ctx.database.state.combats.find((c) => c.id === combatId)).toEqual(before) // toujours IN_PROGRESS, mêmes PV
        expect(ctx.record(player.characterId)).toMatchObject({ level: 1, experience: 0 })
        expect(ctx.inventoryOf(player.characterId)).toEqual([])

        const retry = await ctx.playCombatAction.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })
        await expect(ctx.playCombatAction.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })).rejects.toMatchObject({
            code: 'COMBAT_FINISHED'
        })

        expect(retry.rewards?.experienceGained).toBe(25)
        expect(ctx.record(player.characterId).experience).toBe(25)
        expect(ctx.inventoryOf(player.characterId)).toEqual([{ itemId: ctx.database.item('wolf-pelt').id, quantity: 1 }])
    })

    // Le faux exécute les transactions l'une après l'autre : ce test vérifie l'enchaînement, pas les verrous.
    // Les verrous réels sont prouvés sur PostgreSQL (tests/database/inventory-rewards.test.ts).
    it('deux actions finales simultanées → une seule attribution, l’autre COMBAT_FINISHED', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        ctx.random.value = 0.31
        const combatId = await ctx.combatBeforeFinalBlow(player)
        const act = () => ctx.playCombatAction.execute({ accountId: player.accountId, combatId, type: 'ATTACK' })

        const results = await Promise.allSettled([act(), act()])

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'COMBAT_FINISHED' } })
        expect(ctx.random.draws).toBe(1)
        expect(ctx.record(player.characterId).experience).toBe(25)
        expect(ctx.inventoryOf(player.characterId)).toEqual([{ itemId: ctx.database.item('wolf-pelt').id, quantity: 1 }])
    })
})

describe('INV-01 — GetMyInventory', () => {
    it('vide à la création, puis objets empilés après deux victoires', async () => {
        const ctx = setup()
        const player = await ctx.newPlayer()
        expect((await ctx.getMyInventory.execute(player)).items).toEqual([])
        ctx.random.value = 0.31

        for (let i = 0; i < 2; i += 1) {
            const { combat } = await ctx.startCombat.execute({ ...player, monsterId: ctx.database.monsterId('wolf') })
            await ctx.playUntilFinished(player, combat.id)
        }
        const inventory = await ctx.getMyInventory.execute(player)

        expect(inventory.items.map(({ item, quantity }) => [item.code, quantity])).toEqual([['wolf-pelt', 2]])
    })

    it("personnage d'un autre joueur ou inexistant → même CHARACTER_NOT_FOUND (404)", async () => {
        const ctx = setup()
        const alice = await ctx.newPlayer()
        const bob = await ctx.newPlayer()
        const expected = { code: 'CHARACTER_NOT_FOUND', kind: 'NOT_FOUND', message: 'Character not found' }

        await expect(ctx.getMyInventory.execute({ accountId: alice.accountId, characterId: bob.characterId })).rejects.toMatchObject(expected)
        await expect(ctx.getMyInventory.execute({ accountId: alice.accountId, characterId: randomUUID() })).rejects.toMatchObject(expected)
    })
})
