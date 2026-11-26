import type { Account } from '../../domain/account'
import type { RoleName } from '../../domain/permissions'

/** Compte vu par l'administration (L7 D8) : jamais de hash, de compteur d'échecs ni de verrouillage. */
export interface AdminAccountOutput {
    id: string
    email: string
    /** Rôle nommé correspondant aux permissions ; `null` pour une combinaison hors rôle. */
    role: RoleName | null
    suspendedAt: Date | null
    createdAt: Date
}

export function toAdminAccountOutput(account: Account): AdminAccountOutput {
    const { id, email, permissions, suspendedAt, createdAt } = account.snapshot
    return { id, email: email.value, role: permissions.role, suspendedAt, createdAt }
}
