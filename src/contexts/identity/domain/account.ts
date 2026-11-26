import type { Email } from './email'

/** Échecs de connexion consécutifs avant verrouillage : 5 (L6 D7). */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5
/** Durée du verrouillage temporaire : 15 min (L6 D7). */
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000

export interface AccountProps {
    id: string
    email: Email
    passwordHash: string
    /** Échecs de connexion consécutifs depuis le dernier succès ou la dernière fin de verrouillage. */
    failedLoginCount: number
    lockedUntil: Date | null
    createdAt: Date
}

/** Données d'un compte à insérer : l'identifiant, la date et le compteur d'échecs sont attribués par la base. */
export interface NewAccount {
    email: Email
    passwordHash: string
}

export class Account {
    private constructor(private props: AccountProps) {}

    /** Le mot de passe est déjà haché : le domaine ne voit jamais le mot de passe d'un compte existant. */
    static create(input: NewAccount): NewAccount {
        return { email: input.email, passwordHash: input.passwordHash }
    }

    static restore(props: AccountProps): Account {
        return new Account({ ...props })
    }

    get id(): string {
        return this.props.id
    }

    /** Verrouillé jusqu'à `lockedUntil` exclu. */
    isLockedAt(now: Date): boolean {
        return this.props.lockedUntil !== null && now.getTime() < this.props.lockedUntil.getTime()
    }

    /**
     * Tentative de connexion dont le mot de passe a déjà été vérifié (AUTH-03, L6 D6/D7) ; renvoie `true` si la
     * connexion est acceptée.
     * - Compte verrouillé : refus, même avec le bon mot de passe ; l'échec n'est ni compté ni prolongeant.
     * - Verrouillage échu : le compteur repart de zéro.
     * - Succès : compteur remis à zéro. Échec : compteur incrémenté, verrouillage au seuil.
     */
    attemptLogin(passwordMatches: boolean, now: Date): boolean {
        if (this.isLockedAt(now)) return false
        if (this.props.lockedUntil !== null) {
            this.props.lockedUntil = null
            this.props.failedLoginCount = 0
        }
        if (passwordMatches) {
            this.props.failedLoginCount = 0
            return true
        }
        this.props.failedLoginCount += 1
        if (this.props.failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
            this.props.lockedUntil = new Date(now.getTime() + LOGIN_LOCK_DURATION_MS)
        }
        return false
    }

    get snapshot(): Readonly<AccountProps> {
        return { ...this.props }
    }
}
