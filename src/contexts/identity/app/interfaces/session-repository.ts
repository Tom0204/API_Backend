import type { RefreshToken } from '../../domain/refresh-token'
import type { NewSession, Session } from '../../domain/session'

export interface SessionRepository {
    findByAccessTokenHash(accessTokenHash: string): Promise<Session | undefined>
    /** Verrouille la session jusqu'à la fin de la transaction (déconnexion). */
    findByIdForUpdate(id: string): Promise<Session | undefined>
    /**
     * Verrouille le jeton de rafraîchissement, puis sa session (toujours dans cet ordre) : deux rafraîchissements
     * simultanés du même jeton s'exécutent l'un après l'autre.
     */
    findByRefreshTokenHashForUpdate(
        refreshTokenHash: string
    ): Promise<{ session: Session; refreshToken: RefreshToken } | undefined>
    /** Insère la session et son premier jeton de rafraîchissement. */
    insert(session: NewSession): Promise<Session>
    /** Enregistre la session (jeton d'accès, révocation) et les jetons consommés ou émis par une rotation. */
    save(session: Session): Promise<void>
    /** Révoque toutes les sessions encore actives d'un compte ; renvoie leur nombre. */
    revokeAllByAccount(accountId: string, now: Date): Promise<number>
}
