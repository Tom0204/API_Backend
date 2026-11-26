/** Identité transmise aux cas d'usage protégés : tirée du jeton, jamais un objet Express. */
export interface AuthContext {
    accountId: string
}

/** Identité complète d'une requête authentifiée : le compte et la session du jeton d'accès (déconnexion). */
export interface SessionAuthContext extends AuthContext {
    sessionId: string
}
