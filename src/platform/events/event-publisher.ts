import type { EventHandler, EventPublisher } from '../../shared/app/event-publisher'
import type { DomainEvent } from '../../shared/domain/domain-event'

/** Garde-fou contre une cascade sans fin (un handler qui republierait sans cesse). */
export const MAX_EVENTS_PER_PUBLICATION = 1000

/**
 * Publieur d'une transaction : file FIFO, handlers appelés dans l'ordre d'enregistrement (déterministe).
 * Un même événement ne peut être publié qu'une fois. `transaction` est lu à l'appel (référence circulaire).
 */
export function createEventPublisher<T>(handlers: readonly EventHandler<T>[], transaction: () => T): EventPublisher {
    const published = new WeakSet<DomainEvent>()

    return {
        async publish(events) {
            const queue = [...events]
            const processed: DomainEvent[] = []
            for (let event = queue.shift(); event; event = queue.shift()) {
                if (published.has(event)) throw new Error(`Événement déjà publié : ${event.type}`)
                published.add(event)
                processed.push(event)
                if (processed.length > MAX_EVENTS_PER_PUBLICATION) {
                    throw new Error(`Cascade d'événements trop longue (plus de ${MAX_EVENTS_PER_PUBLICATION})`)
                }
                for (const handler of handlers) {
                    if (handler.eventTypes.includes(event.type)) {
                        queue.push(...(await handler.handle(event, transaction())))
                    }
                }
            }
            return processed
        }
    }
}
