/** Durée de validité d'une session : 24 h (AGENTS.md §3). */
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

export interface SessionProps {
    id: string
    accountId: string
    /** Empreinte SHA-256 (hexadécimal) du jeton : le jeton en clair n'est jamais stocké. */
    tokenHash: string
    expiresAt: Date
}

export type NewSession = Omit<SessionProps, 'id'>

export class Session {
    private constructor(private readonly props: SessionProps) {}

    static open(input: { accountId: string; tokenHash: string; now: Date }): NewSession {
        return {
            accountId: input.accountId,
            tokenHash: input.tokenHash,
            expiresAt: new Date(input.now.getTime() + SESSION_DURATION_MS)
        }
    }

    static restore(props: SessionProps): Session {
        return new Session(props)
    }

    /** Une session est expirée dès l'instant `expiresAt` inclus. */
    isExpiredAt(now: Date): boolean {
        return now.getTime() >= this.props.expiresAt.getTime()
    }

    get snapshot(): Readonly<SessionProps> {
        return this.props
    }
}
