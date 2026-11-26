import type { Character } from '../../domain/character'

/** Personnage vu hors du contexte : le propriétaire n'est jamais exposé. */
export interface CharacterOutput {
    id: string
    name: string
    classId: string
    zoneId: string
    level: number
    experience: number
    createdAt: Date
}

export function toCharacterOutput(character: Character): CharacterOutput {
    const { id, name, classId, zoneId, progression, createdAt } = character.snapshot
    return {
        id,
        name: name.value,
        classId,
        zoneId,
        level: progression.level,
        experience: progression.experience,
        createdAt
    }
}
