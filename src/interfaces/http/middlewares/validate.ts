import type { RequestHandler } from 'express'
import type { z } from 'zod'
import type { ErrorDetail } from '../http-response'

type Location = 'params' | 'query' | 'body'

export type RequestSchemas = Partial<Record<Location, z.ZodType>>

/** Requête refusée par un schéma Zod ; traduite en 400 `VALIDATION_ERROR` par le middleware d'erreurs. */
export class RequestValidationError extends Error {
    constructor(readonly details: ErrorDetail[]) {
        super('Validation failed')
        this.name = 'RequestValidationError'
    }
}

const LOCATIONS: Location[] = ['params', 'query', 'body']

/**
 * Valide `params`, `query` et `body` avec des schémas stricts et remplace chaque partie par sa valeur validée.
 * Une partie sans schéma doit être vide : tout paramètre ou champ inattendu est refusé, jamais ignoré.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
    return (req, _res, next) => {
        const details: ErrorDetail[] = []

        for (const location of LOCATIONS) {
            const schema = schemas[location]
            const value: unknown = req[location]

            if (!schema) {
                details.push(...unexpectedKeys(value))
                continue
            }

            const result = schema.safeParse(value)
            if (result.success) {
                req[location] = result.data
            } else {
                details.push(...result.error.issues.flatMap((issue) => toDetails(issue, location)))
            }
        }

        next(details.length > 0 ? new RequestValidationError(details) : undefined)
    }
}

function unexpectedKeys(value: unknown): ErrorDetail[] {
    if (typeof value !== 'object' || value === null) return []
    return Object.keys(value).map((field) => ({ field, message: 'Unknown field' }))
}

function toDetails(issue: z.core.$ZodIssue, location: Location): ErrorDetail[] {
    const prefix = issue.path.map(String).join('.')
    if (issue.code === 'unrecognized_keys') {
        return issue.keys.map((key) => ({ field: prefix ? `${prefix}.${key}` : key, message: 'Unknown field' }))
    }
    return [{ field: prefix || location, message: issue.message }]
}
