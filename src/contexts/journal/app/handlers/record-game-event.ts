import type { EventHandler } from '../../../../shared/app/event-publisher'
import type { DomainEvent } from '../../../../shared/domain/domain-event'
import { type JsonObject, toJsonValue } from '../../domain/game-event-entry'
import { isJournaled, JOURNALED_EVENT_TYPES } from '../interfaces/journaled-event'
import type { JournalRepository } from '../interfaces/journal-repository'

type Transaction = { journal: JournalRepository }

/** Enregistre chaque événement de jeu dans le journal, dans la transaction qui l'a produit (EVT-03). */
export function createRecordGameEvent(): EventHandler<Transaction> {
    return {
        name: 'journal.recordGameEvent',
        eventTypes: JOURNALED_EVENT_TYPES,
        async handle(event, { journal }): Promise<readonly DomainEvent[]> {
            if (!isJournaled(event)) throw new Error(`Événement non journalisable : ${event.type}`)
            const { type, occurredAt, characterId, combatId, ...data } = event
            const payload: JsonObject = {}
            for (const [key, value] of Object.entries(data)) payload[key] = toJsonValue(value)
            await journal.append({ type, characterId, combatId: combatId ?? null, payload, occurredAt })
            return []
        }
    }
}
