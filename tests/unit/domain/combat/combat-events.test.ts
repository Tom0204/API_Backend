import { describe, expect, it } from 'vitest'
import { Combat } from '../../../../src/contexts/combat/domain/combat'
import { combatStartedEvents } from '../../../../src/contexts/combat/domain/combat-events'

const now = new Date('2026-11-26T10:00:00.000Z')
const WARRIOR_L1 = { maxHp: 120, attack: 12, defense: 8, speed: 8 }
const MAGE_L1 = { maxHp: 80, attack: 10, defense: 4, speed: 10 }
const WOLF = { maxHp: 40, attack: 8, defense: 2, speed: 9 }
const BANDIT = { maxHp: 75, attack: 12, defense: 6, speed: 11 }

/** Combat démarré puis « inséré » (identifiant attribué), comme après `combats.insert`. */
function started(character: typeof WARRIOR_L1, monster: typeof WOLF) {
    const { combat, openingTurn } = Combat.start({
        characterId: 'hero',
        monsterTemplateId: 'monster',
        monsterName: 'Monstre',
        character,
        monster,
        now
    })
    return { combat: Combat.restore({ ...combat, id: 'combat-1', createdAt: now }), openingTurn }
}

describe('événements du combat (EVT-02, EVT-03, L5 D4)', () => {
    it('démarrage : CombatStarted puis l’attaque d’ouverture du loup (7 dégâts, 113 PV)', () => {
        const { combat, openingTurn } = started(WARRIOR_L1, WOLF)

        expect(combatStartedEvents(combat, openingTurn, now)).toEqual([
            { type: 'CombatStarted', occurredAt: now, combatId: 'combat-1', characterId: 'hero', monsterId: 'monster' },
            {
                type: 'CombatTurnPlayed',
                occurredAt: now,
                combatId: 'combat-1',
                characterId: 'hero',
                attacker: 'MONSTER',
                damage: 7,
                characterHp: 113,
                monsterHp: 40
            }
        ])
    })

    it('exemple §8 : une attaque et une riposte par action, puis CombatWon ; la liste est vidée à la lecture', () => {
        const { combat } = started(WARRIOR_L1, WOLF)

        combat.attack(now)
        const firstAction = combat.pullEvents()
        for (let i = 0; i < 2; i += 1) combat.attack(now)
        combat.pullEvents()
        combat.attack(now)
        const finalAction = combat.pullEvents()

        expect(firstAction.map((e) => [e.type, 'attacker' in e ? e.attacker : '', 'damage' in e ? e.damage : ''])).toEqual([
            ['CombatTurnPlayed', 'CHARACTER', 11],
            ['CombatTurnPlayed', 'MONSTER', 7]
        ])
        expect(finalAction).toEqual([
            { type: 'CombatTurnPlayed', occurredAt: now, combatId: 'combat-1', characterId: 'hero', attacker: 'CHARACTER', damage: 11, characterHp: 92, monsterHp: 0 },
            { type: 'CombatWon', occurredAt: now, combatId: 'combat-1', characterId: 'hero', monsterId: 'monster' }
        ])
        expect(combat.pullEvents()).toEqual([])
    })

    it('défaite : le dernier événement est CombatLost, jamais CombatWon', () => {
        const { combat } = started(MAGE_L1, BANDIT)
        const events = []
        while (!combat.isFinished) {
            combat.attack(now)
            events.push(...combat.pullEvents())
        }

        expect(events.at(-1)).toMatchObject({ type: 'CombatLost', combatId: 'combat-1', characterId: 'hero', monsterId: 'monster' })
        expect(events.some((e) => e.type === 'CombatWon')).toBe(false)
        expect(events.at(-2)).toMatchObject({ type: 'CombatTurnPlayed', attacker: 'MONSTER', characterHp: 0 })
    })

    it('une action sur un combat terminé n’enregistre aucun événement', () => {
        const { combat } = started(WARRIOR_L1, WOLF)
        while (!combat.isFinished) combat.attack(now)
        combat.pullEvents()

        expect(() => combat.attack(now)).toThrow()
        expect(combat.pullEvents()).toEqual([])
    })
})
