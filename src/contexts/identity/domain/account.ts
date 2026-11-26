import type { Email } from './email'
import { identityErrors } from './identity-errors'
import { Permissions, type RoleName } from './permissions'

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
    permissions: Permissions
    /** Date de suspension par un administrateur (ROLE-03) ; null si le compte est actif. */
    suspendedAt: Date | null
    createdAt: Date
}

/** Données d'un compte à insérer : l'identifiant, la date et le compteur d'échecs sont attribués par la base. */
export interface NewAccount {
    email: Email
    passwordHash: string
    permissions: Permissions
}

export class Account {
    private constructor(private props: AccountProps) {}

    /**
     * Le mot de passe est déjà haché : le domaine ne voit jamais le mot de passe d'un compte existant.
     * Tout nouveau compte reçoit le rôle joueur (ROLE-01), sauf le premier administrateur créé par le seed.
     */
    static create(input: { email: Email; passwordHash: string; role?: RoleName }): NewAccount {
        return {
            email: input.email,
            passwordHash: input.passwordHash,
            permissions: Permissions.ofRole(input.role ?? 'PLAYER')
        }
    }

    static restore(props: AccountProps): Account {
        return new Account({ ...props })
    }

    get id(): string {
        return this.props.id
    }

    get permissions(): Permissions {
        return this.props.permissions
    }

    get isSuspended(): boolean {
        return this.props.suspendedAt !== null
    }

    /** Verrouillé jusqu'à `lockedUntil` exclu. */
    isLockedAt(now: Date): boolean {
        return this.props.lockedUntil !== null && now.getTime() < this.props.lockedUntil.getTime()
    }

    /**
     * Tentative de connexion dont le mot de passe a déjà été vérifié (AUTH-03, L6 D6/D7) ; renvoie `true` si la
     * connexion est acceptée.
     * - Compte suspendu (L7 D7) : refus, sans toucher au compteur.
     * - Compte verrouillé : refus, même avec le bon mot de passe ; l'échec n'est ni compté ni prolongeant.
     * - Verrouillage échu : le compteur repart de zéro.
     * - Succès : compteur remis à zéro. Échec : compteur incrémenté, verrouillage au seuil.
     */
    attemptLogin(passwordMatches: boolean, now: Date): boolean {
        if (this.isSuspended) return false
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

    /** Suspension par `actor` (ROLE-03) ; idempotente : une seconde suspension garde la date d'origine (L7 D4). */
    suspend(actor: Account, now: Date): void {
        this.assertAdministrableBy(actor)
        this.props.suspendedAt ??= now
    }

    /** Réactivation par `actor` ; idempotente. */
    reactivate(actor: Account): void {
        this.assertAdministrableBy(actor)
        this.props.suspendedAt = null
    }

    /** Attribution d'un rôle nommé ; `actor` doit déjà détenir toutes les permissions de ce rôle (L7 D5). */
    changeRole(actor: Account, role: RoleName): void {
        this.assertAdministrableBy(actor)
        const permissions = Permissions.ofRole(role)
        if (!actor.permissions.includes(permissions)) throw identityErrors.forbidden()
        this.props.permissions = permissions
    }

    /**
     * Garde-fous d'administration : jamais son propre compte (L7 D6), jamais un compte qui détient une permission que
     * l'acteur n'a pas (L7 D5). La permission de l'action elle-même est contrôlée avant, par `requirePermission`.
     */
    private assertAdministrableBy(actor: Account): void {
        if (actor.id === this.id) throw identityErrors.selfAdministrationRefused()
        if (!actor.permissions.includes(this.permissions)) throw identityErrors.forbidden()
    }

    get snapshot(): Readonly<AccountProps> {
        return { ...this.props }
    }
}
