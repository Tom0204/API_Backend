import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RequestHandler } from 'express'
import type { Logger } from 'pino'
import { pinoHttp } from 'pino-http'

/** `X-Request-Id` fourni par le client : repris seulement s'il est court et sans caractère spécial (D6). */
const CLIENT_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/

/**
 * Un log par requête : identifiant, méthode, motif de route, statut, durée.
 * Liste blanche (D6) : ni URL réelle, ni paramètres, ni en-têtes, ni corps — donc ni jeton ni mot de passe.
 */
export function createRequestLogger(logger: Logger): RequestHandler {
    return pinoHttp({
        logger,
        genReqId: (req, res) => {
            const incoming = req.headers['x-request-id']
            const id = typeof incoming === 'string' && CLIENT_REQUEST_ID.test(incoming) ? incoming : randomUUID()
            res.setHeader('X-Request-Id', id)
            return id
        },
        wrapSerializers: false,
        // Sérialisé à l'arrivée de la requête, avant le routage : le motif de route est ajouté à la fin.
        serializers: {
            req: (req: IncomingMessage) => ({ id: req.id, method: req.method }),
            res: (res: ServerResponse) => ({ statusCode: res.statusCode })
        },
        customSuccessObject: (req, _res, value: object) => ({ ...value, route: routePattern(req) }),
        customErrorObject: (req, _res, _error, value: object) => ({ ...value, route: routePattern(req) }),
        customLogLevel: (_req, res, error) => {
            if (error || res.statusCode >= 500) return 'error'
            return res.statusCode >= 400 ? 'warn' : 'info'
        },
        customSuccessMessage: () => 'request completed',
        customErrorMessage: () => 'request failed'
    })
}

/**
 * Motif de la route Express qui a traité la requête (`/api/v1/auth/register`), jamais l'URL reçue.
 * Les routes sont déclarées avec leur chemin complet : `req.route.path` suffit, sans `baseUrl`.
 */
function routePattern(req: IncomingMessage): string {
    const route: unknown = Reflect.get(req, 'route')
    if (typeof route === 'object' && route !== null && 'path' in route && typeof route.path === 'string') {
        return route.path
    }
    return '(unmatched)'
}
