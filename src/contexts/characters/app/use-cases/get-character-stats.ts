import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { Stats } from '../../domain/stats'
import type { CharacterClassRepository } from '../interfaces/character-class-repository'
import type { CharacterRepository } from '../interfaces/character-repository'
import { findOwnedCharacter } from '../utils/find-owned-character'
import type { GetMyCharacterInput } from './get-my-character'

/** Statistiques calculées, ressources courantes, XP restante (`null` au niveau maximal). */
export interface CharacterStatsOutput {
    characterId: string
    level: number
    experience: number
    experienceToNextLevel: number | null
    stats: {
        maxHp: number
        currentHp: number
        maxMana: number
        currentMana: number
        attack: number
        defense: number
        speed: number
    }
}

type Transaction = { characters: CharacterRepository; classes: CharacterClassRepository }

export function createGetCharacterStats({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: ({ accountId, characterId }: GetMyCharacterInput): Promise<CharacterStatsOutput> =>
            unitOfWork.run(async ({ characters, classes }) => {
                const character = await findOwnedCharacter(characters, characterId, accountId)
                const { classId, progression } = character.snapshot
                const characterClass = await classes.findById(classId)
                // Clé étrangère en base : un personnage sans classe est une erreur de programmation (→ 500).
                if (!characterClass) throw new Error(`Classe introuvable pour le personnage ${character.id}`)
                const stats = Stats.forLevel(characterClass, progression.level)
                return {
                    characterId: character.id,
                    level: progression.level,
                    experience: progression.experience,
                    experienceToNextLevel: progression.experienceToNextLevel,
                    stats: {
                        maxHp: stats.hp,
                        currentHp: stats.currentHp,
                        maxMana: stats.mana,
                        currentMana: stats.currentMana,
                        attack: stats.attack,
                        defense: stats.defense,
                        speed: stats.speed
                    }
                }
            })
    }
}

export type GetCharacterStats = ReturnType<typeof createGetCharacterStats>
