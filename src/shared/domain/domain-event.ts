/**
 * Fait métier passé, immuable, nommé au passé (`CombatWon`). Le `type` est le contrat entre contextes : le contexte
 * émetteur déclare l'événement dans son domaine, chaque contexte récepteur déclare la forme qu'il attend.
 */
export interface DomainEvent {
    readonly type: string
    readonly occurredAt: Date
}
