import type { RequestHandler } from 'express'
import { failure } from '../http-response'

/** Aucune route ne correspond : 404 `ROUTE_NOT_FOUND`, dans l'enveloppe d'erreur. */
export const notFound: RequestHandler = (_req, res) => {
    res.status(404).json(failure('Route not found', 'ROUTE_NOT_FOUND'))
}
