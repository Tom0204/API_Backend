import type { DomainEvent } from '../../../shared/domain/domain-event'
import type { Character } from './character'

export interface CharacterCreated extends DomainEvent {
    readonly type: 'CharacterCreated'
    readonly characterId: string
    readonly classId: string
    readonly name: string
}

/** Gain d'XP attribué par le serveur (rules.md §5), quelle qu'en soit l'origine (ici : une victoire). */
export interface ExperienceGranted extends DomainEvent {
    readonly type: 'ExperienceGranted'
    readonly characterId: string
    readonly combatId: string
    readonly amount: number
    readonly levelsGained: number
    readonly level: number
    readonly experience: number
}

export interface CharacterLeveledUp extends DomainEvent {
    readonly type: 'CharacterLeveledUp'
    readonly characterId: string
    readonly level: number
    readonly levelsGained: number
}

/** Émis par le cas d'usage après l'insertion : l'identifiant est attribué par la base (L5 D2). */
export function characterCreated(character: Character, now: Date): CharacterCreated {
    const { id, classId, name } = character.snapshot
    return { type: 'CharacterCreated', occurredAt: now, characterId: id, classId, name: name.value }
}
