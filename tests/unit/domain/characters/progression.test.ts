import { describe, expect, it } from 'vitest'
import { experienceRequired, Progression } from '../../../../src/contexts/characters/domain/progression'

describe('experienceRequired (rules.md §5)', () => {
    it('reproduit le tableau XP pour n → n + 1 et l’XP cumulée', () => {
        const required = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(experienceRequired)
        const cumulative = required.map((_, i) => required.slice(0, i + 1).reduce((a, b) => a + b, 0))

        expect(required).toEqual([100, 283, 520, 800, 1118, 1470, 1852, 2263, 2700])
        expect(cumulative).toEqual([100, 383, 903, 1703, 2821, 4291, 6143, 8406, 11106])
    })
})

describe('Progression', () => {
    it('commence au niveau 1 avec 0 XP', () => {
        expect(Progression.initial()).toMatchObject({ level: 1, experience: 0, experienceToNextLevel: 100 })
    })

    it('exemple de rules.md : niveau 1 avec 90 XP, + 300 XP → niveau 3 avec 7 XP', () => {
        const { progression, levelsGained } = Progression.of(1, 90).gain(300)

        expect(progression).toMatchObject({ level: 3, experience: 7 })
        expect(levelsGained).toBe(2)
    })

    it('un gain juste suffisant passe le niveau avec 0 XP', () => {
        expect(Progression.of(1, 90).gain(10).progression).toMatchObject({ level: 2, experience: 0 })
        expect(Progression.of(1, 90).gain(9).progression).toMatchObject({ level: 1, experience: 99 })
    })

    it('atteindre le niveau 10 perd le reste ; XP 0 et aucune XP restante', () => {
        const { progression, levelsGained } = Progression.initial().gain(11_106 + 5_000)

        expect(progression).toMatchObject({ level: 10, experience: 0, experienceToNextLevel: null })
        expect(levelsGained).toBe(9)
    })

    it('au niveau 10, tout gain est ignoré', () => {
        const { progression, levelsGained } = Progression.of(10, 0).gain(1_000)

        expect(progression).toMatchObject({ level: 10, experience: 0 })
        expect(levelsGained).toBe(0)
    })

    it('le plus grand entier sûr ne provoque aucun débordement', () => {
        expect(Progression.initial().gain(Number.MAX_SAFE_INTEGER).progression.level).toBe(10)
    })

    it.each([0, -5, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('refuse un gain invalide : %s', (amount) => {
        expect(() => Progression.initial().gain(amount)).toThrow("Gain d'XP invalide")
    })

    it.each([
        [0, 0],
        [11, 0],
        [1, -1],
        [1, 100],
        [10, 1],
        [2.5, 0]
    ])('refuse un état incohérent : niveau %s, XP %s', (level, experience) => {
        expect(() => Progression.of(level, experience)).toThrow('Progression invalide')
    })

    it('reste immuable : gain renvoie une nouvelle progression', () => {
        const before = Progression.of(2, 10)
        before.gain(50)

        expect(before).toMatchObject({ level: 2, experience: 10, experienceToNextLevel: 273 })
    })
})
