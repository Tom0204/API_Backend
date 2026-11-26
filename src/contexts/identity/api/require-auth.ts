import type { RequestHandler } from 'express'
import { asyncHandler } from '../../../platform/http/async-handler'
import { setAuth } from '../../../platform/http/request-auth'
import type { Authenticate } from '../app/use-cases/authenticate'
import { identityErrors } from '../domain/identity-errors'

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{1,512})$/

/** Jeton absent, mal formé, inconnu ou expiré → 401 `UNAUTHENTICATED` avec `WWW-Authenticate`. */
export function createRequireAuth(authenticate: Authenticate): RequestHandler {
    return (req, res, next) =>
        asyncHandler(async () => {
            const match = BEARER.exec(req.headers.authorization ?? '')
            if (!match?.[1]) throw identityErrors.unauthenticated()

            setAuth(req, await authenticate.execute(match[1]))
            next()
        })(req, res, next)
}
