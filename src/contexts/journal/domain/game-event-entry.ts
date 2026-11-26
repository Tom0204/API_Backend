/** Valeur JSON : seule forme admise pour les données d'une entrée du journal. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

/** Entrée du journal des événements de jeu (EVT-03) : immuable, jamais modifiée après l'écriture. */
export interface GameEventEntry {
    readonly type: string
    readonly characterId: string
    readonly combatId: string | null
    /** Données propres à l'événement, sans donnée sensible. */
    readonly payload: JsonObject
    readonly occurredAt: Date
}

/** Convertit une valeur en JSON ; une valeur non sérialisable est une erreur de programmation (→ 500). */
export function toJsonValue(value: unknown): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Nombre non sérialisable dans le journal')
        return value
    }
    if (Array.isArray(value)) return value.map(toJsonValue)
    if (typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]))
    }
    throw new Error(`Valeur non sérialisable dans le journal : ${typeof value}`)
}
