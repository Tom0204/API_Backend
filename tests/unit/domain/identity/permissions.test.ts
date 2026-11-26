import { describe, expect, it } from 'vitest'
import {
    ALL_PERMISSIONS_MASK,
    PERMISSION_FLAGS,
    Permissions,
    ROLE_NAMES,
    ROLES
} from '../../../../src/contexts/identity/domain/permissions'

describe('Permissions — masque de bits (ROLE-01)', () => {
    it('flags 1 << n et rôles comme combinaisons (L7 D1)', () => {
        expect(PERMISSION_FLAGS).toEqual({ PLAY: 1, ACCOUNTS_READ: 2, ACCOUNTS_SUSPEND: 4, ACCOUNTS_MANAGE_ROLES: 8 })
        expect(ALL_PERMISSIONS_MASK).toBe(15)
        expect(ROLE_NAMES).toEqual(['PLAYER', 'MODERATOR', 'ADMIN'])
        expect(ROLES).toEqual({ PLAYER: 1, MODERATOR: 7, ADMIN: 15 })
    })

    it('has : test par & ; grant : | ; revoke : & ~', () => {
        const player = Permissions.ofRole('PLAYER')

        expect(player.has('PLAY')).toBe(true)
        expect(player.has('ACCOUNTS_READ')).toBe(false)

        const granted = player.grant('ACCOUNTS_READ')
        expect(granted.mask).toBe(0b0011)
        expect(granted.has('ACCOUNTS_READ')).toBe(true)
        expect(granted.grant('ACCOUNTS_READ').mask).toBe(0b0011) // idempotent

        const revoked = granted.revoke('PLAY')
        expect(revoked.mask).toBe(0b0010)
        expect(revoked.has('PLAY')).toBe(false)
        expect(revoked.revoke('PLAY').mask).toBe(0b0010) // idempotent
    })

    it('immuable : grant et revoke renvoient une nouvelle valeur', () => {
        const player = Permissions.ofRole('PLAYER')

        player.grant('ACCOUNTS_MANAGE_ROLES')
        player.revoke('PLAY')

        expect(player.mask).toBe(1)
    })

    it('fromMask : accepte tout masque des bits connus, y compris 0', () => {
        expect(Permissions.fromMask(0).mask).toBe(0)
        expect(Permissions.fromMask(15).mask).toBe(15)
        expect(Permissions.fromMask(0b0101).has('ACCOUNTS_SUSPEND')).toBe(true)
    })

    it.each([16, 1 << 30, -1, 1.5, Number.NaN])('fromMask(%s) : bit inconnu ou valeur invalide refusé', (mask) => {
        expect(() => Permissions.fromMask(mask)).toThrow('Masque de permissions invalide')
    })

    it('role : nom du rôle correspondant exactement, null sinon', () => {
        expect(Permissions.fromMask(1).role).toBe('PLAYER')
        expect(Permissions.fromMask(7).role).toBe('MODERATOR')
        expect(Permissions.fromMask(15).role).toBe('ADMIN')
        expect(Permissions.fromMask(0).role).toBeNull()
        expect(Permissions.fromMask(0b0011).role).toBeNull()
    })

    it('includes : inclusion des permissions (hiérarchie, L7 D5)', () => {
        const admin = Permissions.ofRole('ADMIN')
        const moderator = Permissions.ofRole('MODERATOR')
        const player = Permissions.ofRole('PLAYER')

        expect(admin.includes(moderator)).toBe(true)
        expect(moderator.includes(player)).toBe(true)
        expect(moderator.includes(moderator)).toBe(true)
        expect(moderator.includes(admin)).toBe(false)
        expect(player.includes(Permissions.fromMask(0b0010))).toBe(false)
    })
})
