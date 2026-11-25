import { describe, expect, it } from 'vitest'
import { MonsterTemplate, type MonsterTemplateProps } from '../../../../src/domain/world/monster-template'

const PELT = { id: 'item-pelt', code: 'wolf-pelt', name: 'Peau de loup' }
const WOLF: MonsterTemplateProps = {
    id: 'wolf',
    code: 'wolf',
    zoneId: 'clearing',
    name: 'Loup',
    level: 1,
    hp: 40,
    attack: 8,
    defense: 2,
    speed: 9,
    xpReward: 25,
    loot: { item: PELT, chance: 0.5 }
}

describe('MonsterTemplate.rollLoot (rules.md §7 : objet obtenu si r < p)', () => {
    it.each([
        [0.31, PELT],
        [0, PELT],
        [0.4999, PELT],
        [0.5, null],
        [0.9, null]
    ])('loup (p = 0,5), r = %s', (r, expected) => {
        expect(MonsterTemplate.restore(WOLF).rollLoot(r)).toEqual(expected)
    })

    it('monstre sans butin → aucun objet', () => {
        expect(MonsterTemplate.restore({ ...WOLF, loot: null }).rollLoot(0)).toBeNull()
    })

    it.each([1, -0.1, Number.NaN])('tirage hors de [0, 1[ (%s) → erreur de programmation', (r) => {
        expect(() => MonsterTemplate.restore(WOLF).rollLoot(r)).toThrow('Tirage')
    })
})
