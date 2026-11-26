import type { DomainEvent } from '../../../../shared/domain/domain-event'

/** `CombatWon` vu par characters : seuls les champs utiles à l'attribution de l'XP (contrat par le `type`). */
export interface CombatWonEvent extends DomainEvent {
    readonly type: 'CombatWon'
    readonly combatId: string
    readonly characterId: string
    readonly monsterId: string
}

export function isCombatWon(event: DomainEvent): event is CombatWonEvent {
    return (
        event.type === 'CombatWon' &&
        'combatId' in event &&
        typeof event.combatId === 'string' &&
        'characterId' in event &&
        typeof event.characterId === 'string' &&
        'monsterId' in event &&
        typeof event.monsterId === 'string'
    )
}
