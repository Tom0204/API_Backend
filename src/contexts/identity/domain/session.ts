import type { RefreshToken } from './refresh-token'

/** Durée de validité d'un jeton d'accès : 15 min (L6 D1). */
export const ACCESS_TOKEN_DURATION_MS = 15 * 60 * 1000
/** Durée d'une famille de sessions, fixée à la connexion : limite des rafraîchissements, 7 jours (L6 D1). */
export const REFRESH_TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export interface SessionProps {
    id: string
    accountId: string
    /** Empreinte SHA-256 (hexadécimal) du jeton d'accès courant : le jeton en clair n'est jamais stocké. */
    accessTokenHash: string
    accessExpiresAt: Date
    /** Fin de la famille : aucun rafraîchissement au-delà, jamais repoussée (non glissante). */
    expiresAt: Date
    revokedAt: Date | null
}

/** Session à insérer, avec l'empreinte de son premier jeton de rafraîchissement. */
export interface NewSession extends Omit<SessionProps, 'id'> {
    refreshTokenHash: string
}

/** Modifications à enregistrer par le repository après une rotation. */
export interface SessionChanges {
    usedRefreshTokenIds: readonly string[]
    newRefreshTokenHashes: readonly string[]
    usedAt: Date | null
}

/**
 * Famille de sessions issue d'une connexion (AUTH-01) : racine de l'agrégat qui porte le jeton d'accès courant
 * et ses jetons de rafraîchissement à usage unique.
 */
export class Session {
    private usedRefreshTokenIds: string[] = []
    private newRefreshTokenHashes: string[] = []
    private usedAt: Date | null = null

    private constructor(private props: SessionProps) {}

    static open(input: { accountId: string; accessTokenHash: string; refreshTokenHash: string; now: Date }): NewSession {
        const expiresAt = new Date(input.now.getTime() + REFRESH_TOKEN_DURATION_MS)
        return {
            accountId: input.accountId,
            accessTokenHash: input.accessTokenHash,
            accessExpiresAt: accessExpiry(input.now, expiresAt),
            expiresAt,
            revokedAt: null,
            refreshTokenHash: input.refreshTokenHash
        }
    }

    static restore(props: SessionProps): Session {
        return new Session({ ...props })
    }

    get id(): string {
        return this.props.id
    }

    get isRevoked(): boolean {
        return this.props.revokedAt !== null
    }

    /** Jeton d'accès accepté : session non révoquée, jusqu'à `accessExpiresAt` exclu. */
    acceptsAccessAt(now: Date): boolean {
        return !this.isRevoked && now.getTime() < this.props.accessExpiresAt.getTime()
    }

    /** Rafraîchissement possible : session non révoquée, jusqu'à la fin de la famille exclue. */
    isRefreshableAt(now: Date): boolean {
        return !this.isRevoked && now.getTime() < this.props.expiresAt.getTime()
    }

    /**
     * Rotation : le jeton présenté est consommé, un nouveau jeton d'accès remplace l'ancien (aussitôt invalide)
     * et un nouveau jeton de rafraîchissement est émis. Le cas d'usage a déjà écarté les cas refusés.
     */
    rotate(presented: RefreshToken, tokens: { accessTokenHash: string; refreshTokenHash: string }, now: Date): void {
        if (presented.sessionId !== this.props.id) throw new Error('Jeton de rafraîchissement d’une autre session')
        if (presented.isUsed) throw new Error('Jeton de rafraîchissement déjà utilisé')
        if (!this.isRefreshableAt(now)) throw new Error('Session non rafraîchissable')

        this.usedRefreshTokenIds.push(presented.id)
        this.newRefreshTokenHashes.push(tokens.refreshTokenHash)
        this.usedAt = now
        this.props.accessTokenHash = tokens.accessTokenHash
        this.props.accessExpiresAt = accessExpiry(now, this.props.expiresAt)
    }

    /** Révocation définitive (déconnexion, réutilisation détectée) ; sans effet si déjà révoquée. */
    revoke(now: Date): void {
        if (!this.isRevoked) this.props.revokedAt = now
    }

    /** Lu par le repository au moment d'enregistrer. */
    get changes(): SessionChanges {
        return {
            usedRefreshTokenIds: [...this.usedRefreshTokenIds],
            newRefreshTokenHashes: [...this.newRefreshTokenHashes],
            usedAt: this.usedAt
        }
    }

    get snapshot(): Readonly<SessionProps> {
        return { ...this.props }
    }
}

/** Le jeton d'accès n'expire jamais après la famille. */
function accessExpiry(now: Date, familyExpiresAt: Date): Date {
    return new Date(Math.min(now.getTime() + ACCESS_TOKEN_DURATION_MS, familyExpiresAt.getTime()))
}
