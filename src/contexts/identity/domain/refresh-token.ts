export interface RefreshTokenProps {
    id: string
    sessionId: string
    /** Empreinte SHA-256 (hexadécimal) : le jeton en clair n'est jamais stocké. */
    tokenHash: string
    usedAt: Date | null
}

/**
 * Jeton de rafraîchissement, entité de l'agrégat `Session` : à usage unique. Un jeton déjà utilisé reste en base
 * pour détecter sa réutilisation. Son expiration est celle de la famille (`Session.expiresAt`).
 */
export class RefreshToken {
    private constructor(private readonly props: RefreshTokenProps) {}

    static restore(props: RefreshTokenProps): RefreshToken {
        return new RefreshToken({ ...props })
    }

    get id(): string {
        return this.props.id
    }

    get sessionId(): string {
        return this.props.sessionId
    }

    get isUsed(): boolean {
        return this.props.usedAt !== null
    }

    get snapshot(): Readonly<RefreshTokenProps> {
        return { ...this.props }
    }
}
