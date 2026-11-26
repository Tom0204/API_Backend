import { describe, expect, it } from 'vitest'
import { Character } from '../../../../src/contexts/characters/domain/character'
import { CharacterName } from '../../../../src/contexts/characters/domain/character-name'
import { Progression } from '../../../../src/contexts/characters/domain/progression'

describe('Character', () => {
    it('création : niveau 1, XP 0, zone de départ, propriétaire fourni', () => {
        const created = Character.create({
            accountId: 'account-1',
            classId: 'class-1',
            startingZoneId: 'zone-1',
            name: CharacterName.create('Thrall')
        })

        expect(created).toMatchObject({ accountId: 'account-1', classId: 'class-1', zoneId: 'zone-1' })
        expect(created.progression).toMatchObject({ level: 1, experience: 0 })
    })

    it('gainExperience met à jour la progression et renvoie les niveaux gagnés', () => {
        const character = Character.restore({
            id: 'character-1',
            accountId: 'account-1',
            classId: 'class-1',
            zoneId: 'zone-1',
            name: CharacterName.create('Thrall'),
            progression: Progression.of(1, 90),
            createdAt: new Date()
        })

        expect(character.gainExperience(300, new Date())).toBe(2)
        expect(character.snapshot.progression).toMatchObject({ level: 3, experience: 7 })
        expect(character.isOwnedBy('account-1')).toBe(true)
        expect(character.isOwnedBy('account-2')).toBe(false)
    })
})
