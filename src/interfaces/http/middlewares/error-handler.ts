import type { ErrorRequestHandler, Response } from 'express'
// Types de `req.log`, ajouté par pino-http (request-logger.ts) ; absent si l'app est montée sans logger.
import type {} from 'pino-http'
import { DomainError, type DomainErrorKind } from '../../../domain/shared/domain-error'
import { failure } from '../http-response'
import { RequestValidationError } from './validate'

const STATUS_BY_KIND = {
    UNAUTHENTICATED: 401,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RULE_VIOLATION: 422
} as const satisfies Record<DomainErrorKind, number>

/** Erreurs levées par `express.json()` (body-parser), reconnues par leur `type`. */
const BODY_PARSER_ERRORS: Record<string, { status: number; code: string; message: string }> = {
    'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'Invalid JSON' },
    'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
    'charset.unsupported': { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' },
    'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' }
}

/**
 * Seule traduction des erreurs en réponses HTTP. Toute erreur non reconnue (invariant violé, panne)
 * devient un 500 générique, sans aucun détail interne ; elle est journalisée côté serveur.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
    if (res.headersSent) {
        next(error)
        return
    }

    if (error instanceof DomainError) {
        if (error.kind === 'UNAUTHENTICATED') setAuthenticateHeader(res)
        res.status(STATUS_BY_KIND[error.kind]).json(failure(error.message, error.code))
        return
    }

    if (error instanceof RequestValidationError) {
        res.status(400).json(failure('Validation failed', 'VALIDATION_ERROR', error.details))
        return
    }

    const bodyParserError = BODY_PARSER_ERRORS[bodyParserType(error)]
    if (bodyParserError) {
        res.status(bodyParserError.status).json(failure(bodyParserError.message, bodyParserError.code))
        return
    }

    req.log?.error({ err: error }, 'Unexpected error')
    res.status(500).json(failure('Internal server error', 'INTERNAL_ERROR'))
}

export function setAuthenticateHeader(res: Response): void {
    res.setHeader('WWW-Authenticate', 'Bearer realm="api"')
}

function bodyParserType(error: unknown): string {
    return typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
        ? error.type
        : ''
}
