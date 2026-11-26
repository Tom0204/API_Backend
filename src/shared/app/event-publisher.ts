import type { DomainEvent } from '../domain/domain-event'

/** Publication des événements dans la transaction courante (L5). */
export interface EventPublisher {
    /**
     * Exécute les handlers de chaque événement, puis ceux des événements qu'ils produisent (file FIFO), dans la
     * transaction courante : un handler en échec annule toute la transaction. Renvoie tous les événements traités,
     * dans l'ordre (ceux passés en argument, puis ceux de la cascade).
     */
    publish(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

/**
 * Réaction d'un contexte récepteur à un événement. `T` décrit uniquement ce que le handler utilise de la transaction.
 * Il renvoie les événements qu'il produit à son tour (publiés par la même cascade).
 */
export interface EventHandler<T> {
    readonly name: string
    readonly eventTypes: readonly string[]
    handle(event: DomainEvent, transaction: T): Promise<readonly DomainEvent[]>
}
