import type { DomainEvent } from '../../../../shared/domain/domain-event'

/** Forme attendue de tout événement de jeu journalisé : il concerne un personnage, parfois un combat. */
export interface JournaledEvent extends DomainEvent {
    readonly characterId: string
    readonly combatId?: string
}

/** Événements de jeu journalisés (EVT-03, L5 D4). */
export const JOURNALED_EVENT_TYPES = [
    'CharacterCreated',
    'CharacterLeveledUp',
    'ExperienceGranted',
    'CombatStarted',
    'CombatTurnPlayed',
    'CombatWon',
    'CombatLost',
    'LootAwarded'
] as const

export function isJournaled(event: DomainEvent): event is JournaledEvent {
    return (
        'characterId' in event &&
        typeof event.characterId === 'string' &&
        (!('combatId' in event) || typeof event.combatId === 'string')
    )
}
