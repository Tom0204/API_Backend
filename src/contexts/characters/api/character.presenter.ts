import type { CharacterStatsOutput } from '../app/use-cases/get-character-stats'
import type { CharacterOutput } from '../app/utils/character-output'

/** Liste blanche (L2 D2) : le propriétaire n'est jamais exposé. */
export function presentCharacter({ id, name, classId, zoneId, level, experience, createdAt }: CharacterOutput) {
    return { id, name, classId, zoneId, level, experience, createdAt: createdAt.toISOString() }
}

/** L2 D3 : statistiques calculées, ressources courantes, XP restante (null au niveau maximal). */
export function presentCharacterStats({ characterId, level, experience, experienceToNextLevel, stats }: CharacterStatsOutput) {
    const { maxHp, currentHp, maxMana, currentMana, attack, defense, speed } = stats
    return {
        characterId,
        level,
        experience,
        experienceToNextLevel,
        stats: { maxHp, currentHp, maxMana, currentMana, attack, defense, speed }
    }
}
