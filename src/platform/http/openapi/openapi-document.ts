import { z } from 'zod'
import { createCharacterBody } from '../../../contexts/characters/api/character.schemas'
import {
    LEADERBOARD_DEFAULT_LIMIT,
    LEADERBOARD_MAX_LIMIT,
    LEADERBOARD_MAX_OFFSET
} from '../../../contexts/characters/api/leaderboard.schemas'
import { combatActionBody, startCombatBody } from '../../../contexts/combat/api/combat.schemas'
import { changeRoleBody } from '../../../contexts/identity/api/admin-accounts.schemas'
import { loginBody, refreshBody, registerBody } from '../../../contexts/identity/api/auth.schemas'
import { DATA_SCHEMAS, type DataSchemaName, ENVELOPE_SCHEMAS, type JsonSchema } from './openapi-schemas'

/** Erreurs communes, décrites une fois en `components.responses` (conventions.md §5). */
const ERROR_RESPONSES = {
    ValidationError: [400, 'Invalid request (VALIDATION_ERROR, INVALID_JSON)'],
    Unauthenticated: [401, 'Missing, invalid or expired access token (UNAUTHENTICATED)'],
    Forbidden: [403, 'Missing permission (FORBIDDEN)'],
    NotFound: [404, 'Resource of the URL not found, or owned by another player'],
    Conflict: [409, 'Uniqueness or limit conflict'],
    RuleViolation: [422, 'Game rule not met, or resource of the body not found'],
    TooManyRequests: [429, 'Rate limit exceeded (RATE_LIMITED, Retry-After header)'],
    InternalError: [500, 'Unexpected error (INTERNAL_ERROR)']
} as const

type ErrorResponseName = keyof typeof ERROR_RESPONSES

type Access = 'public' | 'authenticated' | { permission: string }

interface OperationSpec {
    tag: string
    summary: string
    access: Access
    /** Corps JSON validé par ce schéma Zod (strict) ; absent → aucun corps admis. */
    body?: z.ZodType
    query?: JsonSchema[]
    success: { status: number; message: string; data: DataSchemaName | { list: DataSchemaName } } | 204
    errors?: ErrorResponseName[]
}

/** Schéma JSON d'une entrée Zod, tel que le client doit l'envoyer (avant transformation). */
function inputSchema(schema: z.ZodType): JsonSchema {
    const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
    return json
}

function dataRef(data: DataSchemaName | { list: DataSchemaName }): JsonSchema {
    return typeof data === 'string'
        ? { $ref: `#/components/schemas/${data}` }
        : { type: 'array', items: { $ref: `#/components/schemas/${data.list}` } }
}

function errorRef(name: ErrorResponseName) {
    return { $ref: `#/components/responses/${name}` }
}

/** Paramètres de chemin : tous des identifiants UUID v7 (conventions.md §2). */
function pathParameters(path: string): JsonSchema[] {
    return [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' }
    }))
}

function operation(path: string, spec: OperationSpec) {
    const errors = new Set<ErrorResponseName>(spec.errors)
    if (spec.body || spec.query || path.includes('{')) errors.add('ValidationError')
    if (spec.access !== 'public') errors.add('Unauthenticated')
    if (typeof spec.access === 'object') errors.add('Forbidden')
    if (path.startsWith('/api/v1')) errors.add('TooManyRequests')
    errors.add('InternalError')

    const responses: Record<string, unknown> =
        spec.success === 204
            ? { 204: { description: 'No content' } }
            : {
                  [spec.success.status]: {
                      description: spec.success.message,
                      content: {
                          'application/json': {
                              schema: {
                                  allOf: [
                                      { $ref: '#/components/schemas/SuccessEnvelope' },
                                      { properties: { message: { examples: [spec.success.message] }, data: dataRef(spec.success.data) } }
                                  ]
                              }
                          }
                      }
                  }
              }
    for (const name of [...errors].sort((a, b) => ERROR_RESPONSES[a][0] - ERROR_RESPONSES[b][0])) {
        responses[ERROR_RESPONSES[name][0]] = errorRef(name)
    }

    const permission = typeof spec.access === 'object' ? ` Requires the ${spec.access.permission} permission.` : ''
    return {
        tags: [spec.tag],
        summary: spec.summary,
        ...(permission ? { description: permission.trim() } : {}),
        ...(spec.access === 'public' ? { security: [] } : {}),
        parameters: [...pathParameters(path), ...(spec.query ?? [])],
        ...(spec.body
            ? { requestBody: { required: true, content: { 'application/json': { schema: inputSchema(spec.body) } } } }
            : {}),
        responses
    }
}

const PLAY = { permission: 'PLAY' } as const

const leaderboardQuery: JsonSchema[] = [
    {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: LEADERBOARD_MAX_LIMIT, default: LEADERBOARD_DEFAULT_LIMIT }
    },
    {
        name: 'offset',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 0, maximum: LEADERBOARD_MAX_OFFSET, default: 0 }
    }
]

/**
 * Spécification OpenAPI 3.1 de toutes les routes (DOC-02). `tests/integration/openapi.test.ts` échoue
 * si une route enregistrée dans l'application n'y figure pas.
 */
export function createOpenApiDocument() {
    return {
        openapi: '3.1.0',
        info: {
            title: 'API MMORPG',
            version: '1.0.0',
            description: 'Backend REST API of a turn-based MMORPG. The server computes every game value.'
        },
        security: [{ bearerAuth: [] }],
        paths: {
            '/health': {
                get: operation('/health', {
                    tag: 'Platform',
                    summary: 'Health check',
                    access: 'public',
                    success: { status: 200, message: 'Service is healthy', data: 'Health' }
                })
            },
            '/docs/openapi.json': {
                get: {
                    tags: ['Platform'],
                    summary: 'This OpenAPI document',
                    security: [],
                    responses: { 200: { description: 'OpenAPI 3.1 document', content: { 'application/json': {} } } }
                }
            },
            '/api/v1/auth/register': {
                post: operation('/api/v1/auth/register', {
                    tag: 'Auth',
                    summary: 'Create an account',
                    access: 'public',
                    body: registerBody,
                    success: { status: 201, message: 'Account created successfully', data: 'Account' },
                    errors: ['Conflict']
                })
            },
            '/api/v1/auth/login': {
                post: operation('/api/v1/auth/login', {
                    tag: 'Auth',
                    summary: 'Log in and receive an access token and a refresh token',
                    access: 'public',
                    body: loginBody,
                    success: { status: 200, message: 'Login successful', data: 'SessionTokens' },
                    errors: ['Unauthenticated']
                })
            },
            '/api/v1/auth/refresh': {
                post: operation('/api/v1/auth/refresh', {
                    tag: 'Auth',
                    summary: 'Rotate the refresh token (single use)',
                    access: 'public',
                    body: refreshBody,
                    success: { status: 200, message: 'Session refreshed successfully', data: 'SessionTokens' },
                    errors: ['Unauthenticated']
                })
            },
            '/api/v1/auth/logout': {
                post: operation('/api/v1/auth/logout', {
                    tag: 'Auth',
                    summary: 'Revoke the current session',
                    access: 'authenticated',
                    success: 204
                })
            },
            '/api/v1/auth/logout-all': {
                post: operation('/api/v1/auth/logout-all', {
                    tag: 'Auth',
                    summary: 'Revoke every session of the account',
                    access: 'authenticated',
                    success: 204
                })
            },
            '/api/v1/auth/me': {
                get: operation('/api/v1/auth/me', {
                    tag: 'Auth',
                    summary: 'Current account',
                    access: 'authenticated',
                    success: { status: 200, message: 'Account retrieved successfully', data: 'Account' }
                })
            },
            '/api/v1/admin/accounts': {
                get: operation('/api/v1/admin/accounts', {
                    tag: 'Administration',
                    summary: 'List accounts',
                    access: { permission: 'ACCOUNTS_READ' },
                    success: { status: 200, message: 'Accounts retrieved successfully', data: { list: 'AdminAccount' } }
                })
            },
            '/api/v1/admin/accounts/{accountId}/suspension': {
                post: operation('/api/v1/admin/accounts/{accountId}/suspension', {
                    tag: 'Administration',
                    summary: 'Suspend an account and revoke its sessions',
                    access: { permission: 'ACCOUNTS_SUSPEND' },
                    success: { status: 200, message: 'Account suspended successfully', data: 'AdminAccount' },
                    errors: ['NotFound', 'RuleViolation']
                })
            },
            '/api/v1/admin/accounts/{accountId}/reactivation': {
                post: operation('/api/v1/admin/accounts/{accountId}/reactivation', {
                    tag: 'Administration',
                    summary: 'Reactivate an account',
                    access: { permission: 'ACCOUNTS_SUSPEND' },
                    success: { status: 200, message: 'Account reactivated successfully', data: 'AdminAccount' },
                    errors: ['NotFound', 'RuleViolation']
                })
            },
            '/api/v1/admin/accounts/{accountId}/role': {
                put: operation('/api/v1/admin/accounts/{accountId}/role', {
                    tag: 'Administration',
                    summary: 'Change the role of an account',
                    access: { permission: 'ACCOUNTS_MANAGE_ROLES' },
                    body: changeRoleBody,
                    success: { status: 200, message: 'Account role updated successfully', data: 'AdminAccount' },
                    errors: ['NotFound', 'RuleViolation']
                })
            },
            '/api/v1/classes': {
                get: operation('/api/v1/classes', {
                    tag: 'Characters',
                    summary: 'Playable classes',
                    access: 'public',
                    success: { status: 200, message: 'Classes retrieved successfully', data: { list: 'CharacterClass' } }
                })
            },
            '/api/v1/characters': {
                post: operation('/api/v1/characters', {
                    tag: 'Characters',
                    summary: 'Create a character (level 1, starting zone)',
                    access: PLAY,
                    body: createCharacterBody,
                    success: { status: 201, message: 'Character created successfully', data: 'Character' },
                    errors: ['Conflict', 'RuleViolation']
                }),
                get: operation('/api/v1/characters', {
                    tag: 'Characters',
                    summary: 'My characters',
                    access: PLAY,
                    success: { status: 200, message: 'Characters retrieved successfully', data: { list: 'Character' } }
                })
            },
            '/api/v1/characters/{characterId}': {
                get: operation('/api/v1/characters/{characterId}', {
                    tag: 'Characters',
                    summary: 'One of my characters',
                    access: PLAY,
                    success: { status: 200, message: 'Character retrieved successfully', data: 'Character' },
                    errors: ['NotFound']
                })
            },
            '/api/v1/characters/{characterId}/stats': {
                get: operation('/api/v1/characters/{characterId}/stats', {
                    tag: 'Characters',
                    summary: 'Computed statistics and progression',
                    access: PLAY,
                    success: { status: 200, message: 'Character stats retrieved successfully', data: 'CharacterStats' },
                    errors: ['NotFound']
                })
            },
            '/api/v1/characters/{characterId}/inventory': {
                get: operation('/api/v1/characters/{characterId}/inventory', {
                    tag: 'Inventory',
                    summary: 'Inventory of one of my characters',
                    access: PLAY,
                    success: { status: 200, message: 'Inventory retrieved successfully', data: { list: 'InventoryItem' } },
                    errors: ['NotFound']
                })
            },
            '/api/v1/leaderboard': {
                get: operation('/api/v1/leaderboard', {
                    tag: 'Characters',
                    summary: 'Characters ranked by level, then experience, then creation date',
                    access: PLAY,
                    query: leaderboardQuery,
                    success: { status: 200, message: 'Leaderboard retrieved successfully', data: { list: 'LeaderboardEntry' } }
                })
            },
            '/api/v1/zones/{zoneId}/monsters': {
                get: operation('/api/v1/zones/{zoneId}/monsters', {
                    tag: 'World',
                    summary: 'Monsters of a zone',
                    access: PLAY,
                    success: { status: 200, message: 'Monsters retrieved successfully', data: { list: 'Monster' } },
                    errors: ['NotFound']
                })
            },
            '/api/v1/combats': {
                post: operation('/api/v1/combats', {
                    tag: 'Combat',
                    summary: 'Start a combat (the monster plays first if faster)',
                    access: PLAY,
                    body: startCombatBody,
                    success: { status: 201, message: 'Combat started successfully', data: 'Combat' },
                    errors: ['Conflict', 'RuleViolation']
                })
            },
            '/api/v1/combats/{combatId}': {
                get: operation('/api/v1/combats/{combatId}', {
                    tag: 'Combat',
                    summary: 'One of my combats',
                    access: PLAY,
                    success: { status: 200, message: 'Combat retrieved successfully', data: 'Combat' },
                    errors: ['NotFound']
                })
            },
            '/api/v1/combats/{combatId}/actions': {
                post: operation('/api/v1/combats/{combatId}/actions', {
                    tag: 'Combat',
                    summary: 'Attack; the monster answers in the same response',
                    access: PLAY,
                    body: combatActionBody,
                    success: { status: 200, message: 'Action resolved successfully', data: 'Combat' },
                    errors: ['NotFound', 'RuleViolation']
                })
            },
            '/api/v1/combats/{combatId}/history': {
                get: operation('/api/v1/combats/{combatId}/history', {
                    tag: 'Combat',
                    summary: 'Turns of one of my combats, in order',
                    access: PLAY,
                    success: { status: 200, message: 'Combat history retrieved successfully', data: 'CombatHistory' },
                    errors: ['NotFound']
                })
            }
        },
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', description: 'Opaque access token returned by login' }
            },
            schemas: { ...ENVELOPE_SCHEMAS, ...DATA_SCHEMAS },
            responses: Object.fromEntries(
                Object.entries(ERROR_RESPONSES).map(([name, [, description]]) => [
                    name,
                    { description, content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } }
                ])
            )
        }
    }
}

export type OpenApiDocument = ReturnType<typeof createOpenApiDocument>
