import type { CharacterStatsView } from '../../../application/characters/get-character-stats'
import type { Character } from '../../../domain/characters/character'

/** Liste blanche (D2) : le propriétaire n'est jamais exposé. */
export function presentCharacter(character: Character) {
    const { id, name, classId, zoneId, progression, createdAt } = character.snapshot
    return {
        id,
        name: name.value,
        classId,
        zoneId,
        level: progression.level,
        experience: progression.experience,
        createdAt: createdAt.toISOString()
    }
}

/** D3 : statistiques calculées, ressources courantes, XP restante (null au niveau maximal). */
export function presentCharacterStats({ character, stats }: CharacterStatsView) {
    const { progression } = character.snapshot
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
}
