import type { RequestHandler } from 'express'
import { failure } from '../http-response'

/** Toute requête qui porte un corps doit le déclarer en JSON ; sinon 415 (conventions.md §2). */
export const requireJsonContentType: RequestHandler = (req, res, next) => {
    const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) > 0

    if (hasBody && !req.is('application/json')) {
        res.status(415).json(failure('Unsupported media type', 'UNSUPPORTED_MEDIA_TYPE'))
        return
    }
    next()
}
