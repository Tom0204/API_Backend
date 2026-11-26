/**
 * Schémas JSON des données renvoyées (champ `data`), un par présentateur : liste blanche identique.
 * Les entrées (corps) sont tirées des schémas Zod par `z.toJSONSchema` dans `openapi-document.ts`.
 */
export type JsonSchema = { [key: string]: unknown }

const uuid: JsonSchema = { type: 'string', format: 'uuid' }
const dateTime: JsonSchema = { type: 'string', format: 'date-time' }
const integer: JsonSchema = { type: 'integer' }
const text: JsonSchema = { type: 'string' }

function nullable(schema: JsonSchema): JsonSchema {
    return { anyOf: [schema, { type: 'null' }] }
}

/** Objet fermé dont tous les champs sont toujours présents (conventions.md §3). */
function object(properties: Record<string, JsonSchema>): JsonSchema {
    return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

function arrayOf(schema: JsonSchema): JsonSchema {
    return { type: 'array', items: schema }
}

const statValues = object({ hp: integer, mana: integer, attack: integer, defense: integer, speed: integer })
const combatantFields = { hp: integer, maxHp: integer, attack: integer, defense: integer, speed: integer }
const combatStatus: JsonSchema = { type: 'string', enum: ['IN_PROGRESS', 'VICTORY', 'DEFEAT'] }

export const DATA_SCHEMAS = {
    Health: object({ status: text }),
    Account: object({ id: uuid, email: { type: 'string', format: 'email' }, createdAt: dateTime }),
    SessionTokens: object({
        accessToken: text,
        refreshToken: text,
        tokenType: { type: 'string', const: 'Bearer' },
        accessExpiresAt: dateTime,
        refreshExpiresAt: dateTime
    }),
    AdminAccount: object({
        id: uuid,
        email: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ['PLAYER', 'MODERATOR', 'ADMIN'] },
        suspendedAt: nullable(dateTime),
        createdAt: dateTime
    }),
    CharacterClass: object({ id: uuid, code: text, name: text, baseStats: statValues, statsPerLevel: statValues }),
    Character: object({
        id: uuid,
        name: text,
        classId: uuid,
        zoneId: uuid,
        level: integer,
        experience: integer,
        createdAt: dateTime
    }),
    CharacterStats: object({
        characterId: uuid,
        level: integer,
        experience: integer,
        experienceToNextLevel: nullable(integer),
        stats: object({
            maxHp: integer,
            currentHp: integer,
            maxMana: integer,
            currentMana: integer,
            attack: integer,
            defense: integer,
            speed: integer
        })
    }),
    LeaderboardEntry: object({ rank: integer, name: text, classId: uuid, level: integer, experience: integer }),
    Monster: object({
        id: uuid,
        code: text,
        name: text,
        level: integer,
        stats: object({ hp: integer, attack: integer, defense: integer, speed: integer }),
        xpReward: integer
    }),
    Combat: object({
        id: uuid,
        characterId: uuid,
        monsterId: uuid,
        status: combatStatus,
        character: object(combatantFields),
        monster: object({ name: text, ...combatantFields }),
        lastTurn: nullable(object({ characterDamage: nullable(integer), monsterDamage: nullable(integer) })),
        rewards: nullable(
            object({
                experienceGained: integer,
                levelsGained: integer,
                level: integer,
                experience: integer,
                item: nullable(object({ id: uuid, code: text, name: text, quantity: integer }))
            })
        ),
        createdAt: dateTime,
        finishedAt: nullable(dateTime)
    }),
    CombatHistory: object({
        combatId: uuid,
        status: combatStatus,
        turns: arrayOf(
            object({
                number: integer,
                attacker: { type: 'string', enum: ['CHARACTER', 'MONSTER'] },
                damage: integer,
                characterHp: integer,
                monsterHp: integer
            })
        )
    }),
    InventoryItem: object({ itemId: uuid, code: text, name: text, quantity: integer })
} satisfies Record<string, JsonSchema>

export type DataSchemaName = keyof typeof DATA_SCHEMAS

/** Enveloppes de conventions.md §3 et §4, décrites une seule fois. */
export const ENVELOPE_SCHEMAS = {
    SuccessEnvelope: {
        type: 'object',
        properties: { success: { type: 'boolean', const: true }, message: text, data: {} },
        required: ['success', 'message', 'data']
    },
    ErrorEnvelope: object({
        success: { type: 'boolean', const: false },
        message: text,
        error: object({
            code: text,
            details: arrayOf(object({ field: text, message: text }))
        })
    })
} satisfies Record<string, JsonSchema>
