import { z } from 'zod'
import {
    CHARACTER_NAME_MAX_LENGTH,
    CHARACTER_NAME_MIN_LENGTH,
    CHARACTER_NAME_PATTERN
} from '../../../domain/shared/game-rules'

/** Le client ne fournit que `name` et `classId` (rules.md §4) : niveau, XP, propriétaire… → 400. */
export const createCharacterBody = z.strictObject({
    name: z
        .string('Must be a string')
        .regex(
            CHARACTER_NAME_PATTERN,
            `Must be ${CHARACTER_NAME_MIN_LENGTH} to ${CHARACTER_NAME_MAX_LENGTH} letters (A-Z, a-z)`
        ),
    classId: z.uuid('Must be a valid UUID')
})

export const characterParams = z.strictObject({
    characterId: z.uuid('Must be a valid UUID')
})
