import { identityErrors } from '../../domain/identity-errors'
import type { PermissionName, Permissions } from '../../domain/permissions'

/**
 * Seule fonction de contrôle des permissions (ROLE-02) : appelée par `authenticate`, donc par chaque
 * `requirePermission(...)`. Aucun cas d'usage ni aucune route ne teste un rôle par lui-même.
 */
export function assertPermission(permissions: Permissions, required: PermissionName): void {
    if (!permissions.has(required)) throw identityErrors.forbidden()
}
