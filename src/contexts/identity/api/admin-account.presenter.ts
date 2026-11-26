import type { AdminAccountOutput } from '../app/utils/admin-account-output'

/** Liste blanche (L7 D8) : ni hash, ni compteur d'échecs, ni verrouillage, ni masque brut. */
export function presentAdminAccount({ id, email, role, suspendedAt, createdAt }: AdminAccountOutput) {
    return {
        id,
        email,
        role,
        suspendedAt: suspendedAt ? suspendedAt.toISOString() : null,
        createdAt: createdAt.toISOString()
    }
}
