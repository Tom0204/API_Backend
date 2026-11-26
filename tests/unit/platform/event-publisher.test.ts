import { describe, expect, it } from 'vitest'
import { createEventPublisher, MAX_EVENTS_PER_PUBLICATION } from '../../../src/platform/events/event-publisher'
import type { EventHandler } from '../../../src/shared/app/event-publisher'
import type { DomainEvent } from '../../../src/shared/domain/domain-event'

const at = new Date('2026-11-26T10:00:00.000Z')
const event = (type: string, label = type): DomainEvent & { label: string } => ({ type, occurredAt: at, label })
const labelOf = (e: DomainEvent) => ('label' in e && typeof e.label === 'string' ? e.label : e.type)

/** Handler qui note ses appels et renvoie les événements fournis par `produce`. */
function spy(name: string, eventTypes: string[], calls: string[], produce: (e: DomainEvent) => DomainEvent[] = () => []) {
    const handler: EventHandler<{ marker: string }> = {
        name,
        eventTypes,
        async handle(received, transaction) {
            calls.push(`${name}:${labelOf(received)}:${transaction.marker}`)
            return produce(received)
        }
    }
    return handler
}

describe('createEventPublisher (EVT-01)', () => {
    it('appelle les handlers concernés dans l’ordre d’enregistrement, avec la transaction courante', async () => {
        const calls: string[] = []
        const publisher = createEventPublisher(
            [spy('first', ['A'], calls), spy('other', ['B'], calls), spy('second', ['A'], calls)],
            () => ({ marker: 'tx' })
        )

        await publisher.publish([event('A')])

        expect(calls).toEqual(['first:A:tx', 'second:A:tx'])
    })

    it('cascade FIFO : les événements produits sont traités après ceux déjà en file, et tous sont renvoyés', async () => {
        const calls: string[] = []
        const publisher = createEventPublisher(
            [
                spy('a', ['A'], calls, (e) => [event('B', `B<${labelOf(e)}`)]),
                spy('b', ['B'], calls)
            ],
            () => ({ marker: 'tx' })
        )

        const published = await publisher.publish([event('A', 'A1'), event('A', 'A2')])

        expect(published.map(labelOf)).toEqual(['A1', 'A2', 'B<A1', 'B<A2'])
        expect(calls).toEqual(['a:A1:tx', 'a:A2:tx', 'b:B<A1:tx', 'b:B<A2:tx'])
    })

    it('un événement n’est publié qu’une fois', async () => {
        const publisher = createEventPublisher<{ marker: string }>([], () => ({ marker: 'tx' }))
        const once = event('A')

        await publisher.publish([once])

        await expect(publisher.publish([once])).rejects.toThrow('déjà publié')
        await expect(publisher.publish([event('B', 'b'), event('B', 'c')])).resolves.toHaveLength(2)
    })

    it('arrête une cascade sans fin', async () => {
        const publisher = createEventPublisher([spy('loop', ['A'], [], () => [event('A')])], () => ({ marker: 'tx' }))

        await expect(publisher.publish([event('A')])).rejects.toThrow(`plus de ${MAX_EVENTS_PER_PUBLICATION}`)
    })

    it('propage l’échec d’un handler (la transaction appelante est annulée)', async () => {
        const failing: EventHandler<{ marker: string }> = {
            name: 'failing',
            eventTypes: ['A'],
            handle: async () => {
                throw new Error('handler en échec')
            }
        }
        const publisher = createEventPublisher([failing], () => ({ marker: 'tx' }))

        await expect(publisher.publish([event('A')])).rejects.toThrow('handler en échec')
    })
})
