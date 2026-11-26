import type { Request } from 'express'
import type { AuthContext } from '../../shared/app/auth-context'

/** Identité de chaque requête authentifiée, sans modifier le type `Request` d'Express. */
const authByRequest = new WeakMap<Request, AuthContext>()

/** Appelé uniquement par le middleware `requireAuth` (contexte identity). */
export function setAuth(req: Request, auth: AuthContext): void {
    authByRequest.set(req, auth)
}

/** À n'appeler qu'après `requireAuth` : son absence est une erreur de programmation (→ 500). */
export function getAuth(req: Request): AuthContext {
    const auth = authByRequest.get(req)
    if (!auth) throw new Error('getAuth appelé sur une route non protégée')
    return auth
}
