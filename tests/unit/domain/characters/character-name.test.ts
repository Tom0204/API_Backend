import { describe, expect, it } from 'vitest'
import { CharacterName } from '../../../../src/domain/characters/character-name'

describe('CharacterName (rules.md §4)', () => {
    it.each(['Bob', 'Thrall', 'Abcdefghijklmnop'])('accepte %s', (raw) => {
        expect(CharacterName.create(raw).value).toBe(raw)
    })

    it.each(['Al', 'Abcdefghijklmnopq', 'Élise', 'Jean Luc', 'R2D2', ''])('refuse %j', (raw) => {
        expect(() => CharacterName.create(raw)).toThrow('Nom de personnage invalide')
    })

    it('se compare sans tenir compte de la casse', () => {
        expect(CharacterName.create('ThRaLl').normalized).toBe('thrall')
    })
})
