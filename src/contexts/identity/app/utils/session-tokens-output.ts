import type { Session } from '../../domain/session'

/** Jetons d'une session : les jetons en clair ne sont renvoyés qu'une fois, jamais stockés ni journalisés. */
export interface SessionTokensOutput {
    accessToken: string
    refreshToken: string
    accessExpiresAt: Date
    /** Fin de la famille : le jeton de rafraîchissement n'est plus accepté au-delà. */
    refreshExpiresAt: Date
}

export function toSessionTokensOutput(
    session: Session,
    tokens: { accessToken: string; refreshToken: string }
): SessionTokensOutput {
    const { accessExpiresAt, expiresAt } = session.snapshot
    return { ...tokens, accessExpiresAt, refreshExpiresAt: expiresAt }
}
