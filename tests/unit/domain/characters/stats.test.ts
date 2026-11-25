import { describe, expect, it } from 'vitest'
import { Stats } from '../../../../src/domain/characters/stats'

// Valeurs de rules.md §3 (hp, mana, attaque, défense, vitesse).
const CLASSES = {
    warrior: { base: { hp: 120, mana: 20, attack: 12, defense: 8, speed: 8 }, perLevel: { hp: 12, mana: 2, attack: 2, defense: 2, speed: 1 } },
    mage: { base: { hp: 80, mana: 100, attack: 10, defense: 4, speed: 10 }, perLevel: { hp: 8, mana: 10, attack: 2, defense: 1, speed: 1 } },
    rogue: { base: { hp: 95, mana: 40, attack: 11, defense: 6, speed: 14 }, perLevel: { hp: 10, mana: 4, attack: 2, defense: 1, speed: 2 } }
}

describe('Stats.forLevel (rules.md §3)', () => {
    it('exemple : guerrier niveau 5 → 168 PV, 20 d’attaque', () => {
        expect(Stats.forLevel(CLASSES.warrior, 5)).toMatchObject({ hp: 168, attack: 20 })
    })

    it.each([
        ['warrior', 1, [120, 20, 12, 8, 8]],
        ['warrior', 5, [168, 28, 20, 16, 12]],
        ['warrior', 10, [228, 38, 30, 26, 17]],
        ['mage', 1, [80, 100, 10, 4, 10]],
        ['mage', 5, [112, 140, 18, 8, 14]],
        ['mage', 10, [152, 190, 28, 13, 19]],
        ['rogue', 1, [95, 40, 11, 6, 14]],
        ['rogue', 5, [135, 56, 19, 10, 22]],
        ['rogue', 10, [185, 76, 29, 15, 32]]
    ] as const)('%s niveau %i', (classCode, level, [hp, mana, attack, defense, speed]) => {
        const stats = Stats.forLevel(CLASSES[classCode], level)

        expect({ hp: stats.hp, mana: stats.mana, attack: stats.attack, defense: stats.defense, speed: stats.speed }).toEqual({
            hp,
            mana,
            attack,
            defense,
            speed
        })
    })

    it('PV et mana courants valent le maximum hors combat', () => {
        const stats = Stats.forLevel(CLASSES.mage, 3)

        expect([stats.currentHp, stats.currentMana]).toEqual([stats.hp, stats.mana])
    })

    it.each([0, 11, 2.5])('refuse un niveau invalide : %s', (level) => {
        expect(() => Stats.forLevel(CLASSES.warrior, level)).toThrow('Niveau invalide')
    })
})
