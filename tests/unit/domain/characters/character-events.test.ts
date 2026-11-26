import { describe, expect, it } from 'vitest'
import { Character } from '../../../../src/contexts/characters/domain/character'
import { characterCreated } from '../../../../src/contexts/characters/domain/character-events'
import { CharacterName } from '../../../../src/contexts/characters/domain/character-name'
import { Progression } from '../../../../src/contexts/characters/domain/progression'

const now = new Date('2026-11-26T10:00:00.000Z')
const restore = (level: number, experience: number) =>
    Character.restore({
        id: 'hero',
        accountId: 'account-1',
        classId: 'warrior',
        zoneId: 'clearing',
        name: CharacterName.create('Thrall'),
        progression: Progression.of(level, experience),
        createdAt: now
    })

describe('événements du personnage (EVT-03)', () => {
    it('CharacterCreated : identifiant, classe et nom, sans le propriétaire', () => {
        expect(characterCreated(restore(1, 0), now)).toEqual({
            type: 'CharacterCreated',
            occurredAt: now,
            characterId: 'hero',
            classId: 'warrior',
            name: 'Thrall'
        })
    })

    it('CharacterLeveledUp seulement lors d’un passage de niveau (90 + 300 XP → niveau 3)', () => {
        const character = restore(1, 0)
        character.gainExperience(25, now)
        expect(character.pullEvents()).toEqual([])

        const leveled = restore(1, 90)
        leveled.gainExperience(300, now)
        expect(leveled.pullEvents()).toEqual([
            { type: 'CharacterLeveledUp', occurredAt: now, characterId: 'hero', level: 3, levelsGained: 2 }
        ])
        expect(leveled.pullEvents()).toEqual([])
    })

    it('niveau 10 : gain ignoré, aucun événement', () => {
        const character = restore(10, 0)
        character.gainExperience(500, now)

        expect(character.pullEvents()).toEqual([])
    })
})
