import type { RequestHandler } from 'express'
import { asyncHandler } from '../../../platform/http/async-handler'
import { setAuth } from '../../../platform/http/request-auth'
import type { Authenticate, RequiredPermission } from '../app/use-cases/authenticate'
import { identityErrors } from '../domain/identity-errors'

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{1,512})$/

/**
 * Gardes HTTP construites sur `authenticate` : une seule lecture de la session et du compte par requête.
 * - `requireAuth` : jeton absent, mal formé, inconnu, expiré ou compte suspendu → 401 avec `WWW-Authenticate`.
 * - `requirePermission(p)` : même contrôle, puis 403 `FORBIDDEN` si le compte n'a pas la permission `p` (ROLE-02).
 */
export function createAuthGuards(authenticate: Authenticate): {
    requireAuth: RequestHandler
    requirePermission: (permission: RequiredPermission) => RequestHandler
} {
    const guard =
        (permission?: RequiredPermission): RequestHandler =>
        (req, res, next) =>
            asyncHandler(async () => {
                const match = BEARER.exec(req.headers.authorization ?? '')
                if (!match?.[1]) throw identityErrors.unauthenticated()

                setAuth(req, await authenticate.execute(match[1], permission))
                next()
            })(req, res, next)

    return { requireAuth: guard(), requirePermission: (permission) => guard(permission) }
}
