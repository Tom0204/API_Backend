import type { Request, RequestHandler } from 'express'
import type { AuthContext, Authenticate } from '../../../application/identity/authenticate'
import { identityErrors } from '../../../domain/identity/identity-errors'
import { asyncHandler } from '../async-handler'

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{1,512})$/

/** Identité de chaque requête authentifiée, sans modifier le type `Request` d'Express. */
const authByRequest = new WeakMap<Request, AuthContext>()

/** Jeton absent, mal formé, inconnu ou expiré → 401 `UNAUTHENTICATED` avec `WWW-Authenticate`. */
export function createRequireAuth(authenticate: Authenticate): RequestHandler {
    return (req, res, next) =>
        asyncHandler(async () => {
            const match = BEARER.exec(req.headers.authorization ?? '')
            if (!match?.[1]) throw identityErrors.unauthenticated()

            authByRequest.set(req, await authenticate.execute(match[1]))
            next()
        })(req, res, next)
}

/** À n'appeler qu'après `requireAuth` : son absence est une erreur de programmation (→ 500). */
export function getAuth(req: Request): AuthContext {
    const auth = authByRequest.get(req)
    if (!auth) throw new Error('getAuth appelé sur une route non protégée')
    return auth
}
