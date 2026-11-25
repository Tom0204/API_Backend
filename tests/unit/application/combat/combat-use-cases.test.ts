import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../../../src/application/characters/create-character'
import { createGetCharacterStats } from '../../../../src/application/characters/get-character-stats'
import { createGetMyCombat } from '../../../../src/application/combat/get-my-combat'
import { createPlayCombatAction } from '../../../../src/application/combat/play-combat-action'
import { createStartCombat } from '../../../../src/application/combat/start-combat'
import { createListZoneMonsters } from '../../../../src/application/world/list-zone-monsters'
import { Account } from '../../../../src/domain/identity/account'
import { Email } from '../../../../src/domain/identity/email'
import { FixedClock, FixedRandom } from '../../../fakes/fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

function setup() {
    const database = new InMemoryDatabase()
    const clock = new FixedClock()
    const random = new FixedRandom()
    const deps = { unitOfWork: database, clock, random }
    const createCharacter = createCreateCharacter({ unitOfWork: database, startingZoneId: IN_MEMORY_STARTING_ZONE_ID })
    const newPlayer = async (classCode = 'warrior') => {
        const accountId = (
            await database.run(({ accounts }) =>
                accounts.insert(Account.create({ email: Email.create(`${randomUUID()}@example.com`), passwordHash: 'h' }))
            )
        ).id
        const letters = randomUUID().replace(/[^a-f]/g, '').slice(0, 10)
        const character = await createCharacter.execute({
            accountId,
            name: `Hero${letters}`,
            classId: database.classId(classCode)
        })
        return { accountId, characterId: character.id }
    }
    return {
        database,
        clock,
        random,
        newPlayer,
        listZoneMonsters: createListZoneMonsters(deps),
        startCombat: createStartCombat(deps),
        playCombatAction: createPlayCombatAction(deps),
        getMyCombat: createGetMyCombat(deps),
        getCharacterStats: createGetCharacterStats(deps)
    }
}

describe('ListZoneMonsters', () => {
    it('Clairière : loup, sanglier, bandit triés par niveau, avec les valeurs du seed', async () => {
        const monsters = await setup().listZoneMonsters.execute({ zoneId: IN_MEMORY_STARTING_ZONE_ID })

        expect(monsters.map((m) => m.snapshot)).toEqual([
            expect.objectContaining({ code: 'wolf', name: 'Loup', level: 1, hp: 40, attack: 8, defense: 2, speed: 9, xpReward: 25 }),
            expect.objectContaining({ code: 'boar', name: 'Sanglier', level: 2, hp: 60, attack: 10, defense: 5, speed: 6, xpReward: 40 }),
            expect.objectContaining({ code: 'bandit', name: 'Bandit', level: 3, hp: 75, attack: 12, defense: 6, speed: 11, xpReward: 60 })
        ])
    })

    it('zone inconnue → ZONE_NOT_FOUND', async () => {
        await expect(setup().listZoneMonsters.execute({ zoneId: randomUUID() })).rejects.toMatchObject({
            code: 'ZONE_NOT_FOUND',
            kind: 'NOT_FOUND'
        })
    })
})

describe('StartCombat', () => {
    let ctx: ReturnType<typeof setup>
    beforeEach(() => {
        ctx = setup()
    })

    it('fige les statistiques et joue le premier tour du loup, plus rapide', async () => {
        const { accountId, characterId } = await ctx.newPlayer()

        const { combat, lastTurn } = await ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('wolf') })

        expect(lastTurn).toEqual({ characterDamage: null, monsterDamage: 7 })
        expect(combat.snapshot).toMatchObject({ status: 'IN_PROGRESS', characterId, monsterName: 'Loup' })
        expect(combat.snapshot.character.stats).toEqual({ maxHp: 120, attack: 12, defense: 8, speed: 8 })
        expect(combat.snapshot.character.hp).toBe(113)
    })

    it('personnage plus rapide : aucun tour joué', async () => {
        const { accountId, characterId } = await ctx.newPlayer()

        const { lastTurn } = await ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('boar') })

        expect(lastTurn).toBeNull()
    })

    it("personnage inexistant ou d'un autre joueur → même CHARACTER_NOT_FOUND (422)", async () => {
        const alice = await ctx.newPlayer()
        const bob = await ctx.newPlayer()
        const monsterId = ctx.database.monsterId('wolf')
        const expected = { code: 'CHARACTER_NOT_FOUND', kind: 'RULE_VIOLATION', message: 'Character not found' }

        await expect(ctx.startCombat.execute({ accountId: alice.accountId, characterId: bob.characterId, monsterId })).rejects.toMatchObject(expected)
        await expect(ctx.startCombat.execute({ accountId: alice.accountId, characterId: randomUUID(), monsterId })).rejects.toMatchObject(expected)
    })

    it('monstre inconnu ou hors de la zone du personnage → MONSTER_NOT_IN_ZONE', async () => {
        const { accountId, characterId } = await ctx.newPlayer()
        const record = ctx.database.state.characters.find((c) => c.id === characterId)
        const expected = { code: 'MONSTER_NOT_IN_ZONE', kind: 'RULE_VIOLATION' }

        await expect(ctx.startCombat.execute({ accountId, characterId, monsterId: randomUUID() })).rejects.toMatchObject(expected)
        if (record) record.zoneId = randomUUID() // personnage ailleurs que dans la Clairière
        await expect(ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('wolf') })).rejects.toMatchObject(
            expected
        )
    })

    it('un seul combat IN_PROGRESS par personnage, même en simultané', async () => {
        const { accountId, characterId } = await ctx.newPlayer()
        const start = () => ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('boar') })

        const results = await Promise.allSettled([start(), start()])

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'CHARACTER_ALREADY_IN_COMBAT', kind: 'CONFLICT' } })
        expect(ctx.database.state.combats).toHaveLength(1)
    })
})

describe('PlayCombatAction et GetMyCombat', () => {
    let ctx: ReturnType<typeof setup>
    beforeEach(() => {
        ctx = setup()
    })

    it('exemple §8 jusqu’à VICTORY : 4 actions, 92 PV ; puis COMBAT_FINISHED ; un nouveau combat est possible', async () => {
        const { accountId, characterId } = await ctx.newPlayer()
        const { combat } = await ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('wolf') })
        const act = () => ctx.playCombatAction.execute({ accountId, combatId: combat.id, type: 'ATTACK' })

        for (let i = 0; i < 3; i += 1) expect((await act()).lastTurn).toEqual({ characterDamage: 11, monsterDamage: 7 })
        const final = await act()

        expect(final.lastTurn).toEqual({ characterDamage: 11, monsterDamage: null })
        expect(final.combat.snapshot).toMatchObject({ status: 'VICTORY', finishedAt: ctx.clock.now() })
        expect(final.combat.snapshot.character.hp).toBe(92)
        await expect(act()).rejects.toMatchObject({ code: 'COMBAT_FINISHED', kind: 'RULE_VIOLATION' })
        await expect(
            ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('wolf') })
        ).resolves.toBeDefined()
    })

    it('jusqu’à DEFEAT, puis PV et mana du personnage au maximum (rien n’est stocké)', async () => {
        const { accountId, characterId } = await ctx.newPlayer('mage')
        const { combat } = await ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('bandit') })

        let view = await ctx.playCombatAction.execute({ accountId, combatId: combat.id, type: 'ATTACK' })
        while (view.combat.snapshot.status === 'IN_PROGRESS') {
            view = await ctx.playCombatAction.execute({ accountId, combatId: combat.id, type: 'ATTACK' })
        }

        expect(view.combat.snapshot.status).toBe('DEFEAT')
        expect(view.combat.snapshot.character.hp).toBe(0)
        const { stats } = await ctx.getCharacterStats.execute({ accountId, characterId })
        expect([stats.currentHp, stats.currentMana]).toEqual([80, 100])
    })

    it('le combat est enregistré : la consultation renvoie l’état courant, sans dernier tour', async () => {
        const { accountId, characterId } = await ctx.newPlayer()
        const { combat } = await ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('wolf') })
        await ctx.playCombatAction.execute({ accountId, combatId: combat.id, type: 'ATTACK' })

        const view = await ctx.getMyCombat.execute({ accountId, combatId: combat.id })

        expect(view.lastTurn).toBeNull()
        expect(view.combat.snapshot.character.hp).toBe(106)
        expect(view.combat.snapshot.monster.hp).toBe(29)
    })

    it("combat d'un autre joueur ou inexistant → même COMBAT_NOT_FOUND, même s'il est terminé", async () => {
        const alice = await ctx.newPlayer()
        const bob = await ctx.newPlayer()
        const { combat } = await ctx.startCombat.execute({ ...bob, monsterId: ctx.database.monsterId('wolf') })
        const expected = { code: 'COMBAT_NOT_FOUND', kind: 'NOT_FOUND', message: 'Combat not found' }

        for (const combatId of [combat.id, randomUUID()]) {
            await expect(ctx.getMyCombat.execute({ accountId: alice.accountId, combatId })).rejects.toMatchObject(expected)
            await expect(
                ctx.playCombatAction.execute({ accountId: alice.accountId, combatId, type: 'ATTACK' })
            ).rejects.toMatchObject(expected)
        }
        expect(ctx.database.state.combats[0]?.monster.hp).toBe(40)
    })

    it('deux actions simultanées s’exécutent l’une après l’autre', async () => {
        const { accountId, characterId } = await ctx.newPlayer()
        const { combat } = await ctx.startCombat.execute({ accountId, characterId, monsterId: ctx.database.monsterId('boar') })
        const act = () => ctx.playCombatAction.execute({ accountId, combatId: combat.id, type: 'ATTACK' })

        await Promise.all([act(), act()])

        expect(ctx.database.state.combats[0]?.monster.hp).toBe(60 - 2 * 11)
        expect(ctx.database.state.combats[0]?.character.hp).toBe(120 - 2 * 9)
    })
})
