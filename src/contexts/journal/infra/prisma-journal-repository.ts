import type { Prisma } from '../../../generated/prisma/client'
import { type GameEventEntry, type JsonObject, toJsonValue } from '../domain/game-event-entry'
import type { JournalRepository } from '../app/interfaces/journal-repository'

type GameEventRow = Prisma.GameEventGetPayload<object>

const ORDER = [{ occurredAt: 'asc' }, { id: 'asc' }] as const satisfies Prisma.GameEventOrderByWithRelationInput[]

export function createPrismaJournalRepository(tx: Prisma.TransactionClient): JournalRepository {
    return {
        async append(entry) {
            await tx.gameEvent.create({
                data: {
                    type: entry.type,
                    characterId: entry.characterId,
                    combatId: entry.combatId,
                    payload: entry.payload,
                    occurredAt: entry.occurredAt
                }
            })
        },

        async findByCharacter(characterId) {
            return (await tx.gameEvent.findMany({ where: { characterId }, orderBy: [...ORDER] })).map(toEntry)
        },

        async findByCombat(combatId) {
            return (await tx.gameEvent.findMany({ where: { combatId }, orderBy: [...ORDER] })).map(toEntry)
        }
    }
}

function toEntry(row: GameEventRow): GameEventEntry {
    return {
        type: row.type,
        characterId: row.characterId,
        combatId: row.combatId,
        payload: toPayload(row.payload),
        occurredAt: row.occurredAt
    }
}

/** La contrainte CHECK garantit un objet JSON ; tout autre contenu est une erreur de programmation (→ 500). */
function toPayload(value: Prisma.JsonValue): JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Entrée du journal invalide : données non objet')
    }
    const payload: JsonObject = {}
    for (const [key, entry] of Object.entries(value)) payload[key] = toJsonValue(entry)
    return payload
}
