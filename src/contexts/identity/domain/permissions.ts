/**
 * Permissions d'un compte en masque de bits (ROLE-01, L7 D1) : seul endroit où flags et rôles sont déclarés.
 * Ajouter un flag impose une migration : la contrainte CHECK de `accounts.permissions` n'accepte que ces bits.
 */
export const PERMISSION_FLAGS = {
    PLAY: 1 << 0,
    ACCOUNTS_READ: 1 << 1,
    ACCOUNTS_SUSPEND: 1 << 2,
    ACCOUNTS_MANAGE_ROLES: 1 << 3
} as const

export type PermissionName = keyof typeof PERMISSION_FLAGS

/** Union de tous les flags connus : tout autre bit est refusé. */
export const ALL_PERMISSIONS_MASK = Object.values(PERMISSION_FLAGS).reduce((mask, flag) => mask | flag, 0)

const { PLAY, ACCOUNTS_READ, ACCOUNTS_SUSPEND, ACCOUNTS_MANAGE_ROLES } = PERMISSION_FLAGS

/** Rôles nommés, du moins au plus privilégié : seuls rôles attribuables (L7 D3). */
export const ROLE_NAMES = ['PLAYER', 'MODERATOR', 'ADMIN'] as const

export type RoleName = (typeof ROLE_NAMES)[number]

/** Chaque rôle est une combinaison de flags. */
export const ROLES = {
    PLAYER: PLAY,
    MODERATOR: PLAY | ACCOUNTS_READ | ACCOUNTS_SUSPEND,
    ADMIN: PLAY | ACCOUNTS_READ | ACCOUNTS_SUSPEND | ACCOUNTS_MANAGE_ROLES
} as const satisfies Record<RoleName, number>

export class Permissions {
    private constructor(readonly mask: number) {}

    /** Masque lu en base ou reçu d'ailleurs : entier positif sans bit inconnu, sinon invariant violé (→ 500). */
    static fromMask(mask: number): Permissions {
        if (!Number.isInteger(mask) || mask < 0 || (mask & ~ALL_PERMISSIONS_MASK) !== 0) {
            throw new Error('Masque de permissions invalide')
        }
        return new Permissions(mask)
    }

    static ofRole(role: RoleName): Permissions {
        return new Permissions(ROLES[role])
    }

    has(permission: PermissionName): boolean {
        return (this.mask & PERMISSION_FLAGS[permission]) !== 0
    }

    grant(permission: PermissionName): Permissions {
        return new Permissions(this.mask | PERMISSION_FLAGS[permission])
    }

    revoke(permission: PermissionName): Permissions {
        return new Permissions(this.mask & ~PERMISSION_FLAGS[permission])
    }

    /** Vrai si chaque permission de `other` est aussi dans celles-ci (hiérarchie, L7 D5). */
    includes(other: Permissions): boolean {
        return (other.mask & ~this.mask) === 0
    }

    /** Rôle nommé correspondant exactement au masque ; `null` pour une combinaison hors rôle. */
    get role(): RoleName | null {
        return ROLE_NAMES.find((role) => ROLES[role] === this.mask) ?? null
    }
}
