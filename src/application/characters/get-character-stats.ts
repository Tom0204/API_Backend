import type { Character } from '../../domain/characters/character'
import { Stats } from '../../domain/characters/stats'
import type { UnitOfWork } from '../ports/unit-of-work'
import { findOwnedCharacter } from './find-owned-character'
import type { GetMyCharacterQuery } from './get-my-character'

export interface CharacterStatsView {
    character: Character
    stats: Stats
}

export function createGetCharacterStats({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        execute: ({ accountId, characterId }: GetMyCharacterQuery): Promise<CharacterStatsView> =>
            unitOfWork.run(async ({ characters, classes }) => {
                const character = await findOwnedCharacter(characters, characterId, accountId)
                const { classId, progression } = character.snapshot
                const characterClass = await classes.findById(classId)
                // Clé étrangère en base : un personnage sans classe est une erreur de programmation (→ 500).
                if (!characterClass) throw new Error(`Classe introuvable pour le personnage ${character.id}`)
                return { character, stats: Stats.forLevel(characterClass, progression.level) }
            })
    }
}

export type GetCharacterStats = ReturnType<typeof createGetCharacterStats>
