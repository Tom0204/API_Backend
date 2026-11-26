import { describe, expect, it } from 'vitest'
import {
    Account,
    LOGIN_LOCK_DURATION_MS,
    MAX_FAILED_LOGIN_ATTEMPTS
} from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'
import { Permissions, type RoleName } from '../../../../src/contexts/identity/domain/permissions'

const now = new Date('2026-11-25T10:00:00.000Z')
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

function newAccount(failedLoginCount = 0, lockedUntil: Date | null = null) {
    return Account.restore({
        id: 'account-1',
        email: Email.create('alice@example.com'),
        passwordHash: 'hash',
        failedLoginCount,
        lockedUntil,
        permissions: Permissions.ofRole('PLAYER'),
        suspendedAt: null,
        createdAt: now
    })
}

function accountWithRole(id: string, role: RoleName, suspendedAt: Date | null = null) {
    return Account.restore({
        id,
        email: Email.create(`${id}@example.com`),
        passwordHash: 'hash',
        failedLoginCount: 0,
        lockedUntil: null,
        permissions: Permissions.ofRole(role),
        suspendedAt,
        createdAt: now
    })
}

function failTimes(account: Account, times: number, when = now) {
    for (let i = 0; i < times; i += 1) account.attemptLogin(false, when)
}

describe('Account — verrouillage après échecs de connexion (AUTH-03)', () => {
    it('paramètres : 5 échecs, 15 min (L6 D7)', () => {
        expect(MAX_FAILED_LOGIN_ATTEMPTS).toBe(5)
        expect(LOGIN_LOCK_DURATION_MS).toBe(15 * 60 * 1000)
    })

    it('4 échecs : compté, non verrouillé ; le 5e verrouille 15 min', () => {
        const account = newAccount()

        failTimes(account, MAX_FAILED_LOGIN_ATTEMPTS - 1)
        expect(account.snapshot.failedLoginCount).toBe(4)
        expect(account.isLockedAt(now)).toBe(false)

        expect(account.attemptLogin(false, now)).toBe(false)
        expect(account.snapshot.lockedUntil).toEqual(at(LOGIN_LOCK_DURATION_MS))
        expect(account.isLockedAt(at(LOGIN_LOCK_DURATION_MS - 1))).toBe(true)
        expect(account.isLockedAt(at(LOGIN_LOCK_DURATION_MS))).toBe(false)
    })

    it('verrouillé : bon mot de passe refusé ; échec ni compté ni prolongeant (L6 D6/D7)', () => {
        const account = newAccount()
        failTimes(account, MAX_FAILED_LOGIN_ATTEMPTS)

        expect(account.attemptLogin(true, at(1000))).toBe(false)
        expect(account.attemptLogin(false, at(2000))).toBe(false)

        expect(account.snapshot.failedLoginCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS)
        expect(account.snapshot.lockedUntil).toEqual(at(LOGIN_LOCK_DURATION_MS))
    })

    it("à l'expiration du verrou : connexion acceptée, compteur remis à zéro", () => {
        const account = newAccount()
        failTimes(account, MAX_FAILED_LOGIN_ATTEMPTS)

        expect(account.attemptLogin(true, at(LOGIN_LOCK_DURATION_MS))).toBe(true)
        expect(account.snapshot).toMatchObject({ failedLoginCount: 0, lockedUntil: null })
    })

    it("à l'expiration du verrou, un échec repart de 1", () => {
        const account = newAccount()
        failTimes(account, MAX_FAILED_LOGIN_ATTEMPTS)

        expect(account.attemptLogin(false, at(LOGIN_LOCK_DURATION_MS))).toBe(false)
        expect(account.snapshot).toMatchObject({ failedLoginCount: 1, lockedUntil: null })
    })

    it('un succès remet le compteur à zéro : seuls les échecs consécutifs comptent', () => {
        const account = newAccount()
        failTimes(account, MAX_FAILED_LOGIN_ATTEMPTS - 1)

        expect(account.attemptLogin(true, now)).toBe(true)
        failTimes(account, MAX_FAILED_LOGIN_ATTEMPTS - 1)

        expect(account.snapshot.failedLoginCount).toBe(4)
        expect(account.isLockedAt(now)).toBe(false)
    })
})

describe('Account — rôle et administration (ROLE-01, ROLE-03)', () => {
    it('un nouveau compte reçoit le rôle joueur ; le seed peut demander ADMIN', () => {
        const email = Email.create('new@example.com')

        expect(Account.create({ email, passwordHash: 'hash' }).permissions.role).toBe('PLAYER')
        expect(Account.create({ email, passwordHash: 'hash', role: 'ADMIN' }).permissions.role).toBe('ADMIN')
    })

    it('compte suspendu : bon mot de passe refusé, compteur inchangé (L7 D7)', () => {
        const account = accountWithRole('player', 'PLAYER', now)

        expect(account.attemptLogin(true, now)).toBe(false)
        expect(account.attemptLogin(false, now)).toBe(false)
        expect(account.snapshot.failedLoginCount).toBe(0)
    })

    it('suspension idempotente : la date d’origine est conservée ; réactivation', () => {
        const admin = accountWithRole('admin', 'ADMIN')
        const player = accountWithRole('player', 'PLAYER')

        player.suspend(admin, now)
        player.suspend(admin, at(1000))
        expect(player.snapshot.suspendedAt).toEqual(now)
        expect(player.isSuspended).toBe(true)

        player.reactivate(admin)
        player.reactivate(admin)
        expect(player.snapshot.suspendedAt).toBeNull()
    })

    it('jamais sur son propre compte → SELF_ADMINISTRATION_REFUSED (L7 D6)', () => {
        const admin = accountWithRole('admin', 'ADMIN')
        const self = expect.objectContaining({ code: 'SELF_ADMINISTRATION_REFUSED', kind: 'RULE_VIOLATION' })

        expect(() => admin.suspend(admin, now)).toThrow(self)
        expect(() => admin.reactivate(admin)).toThrow(self)
        expect(() => admin.changeRole(admin, 'PLAYER')).toThrow(self)
        expect(admin.snapshot).toMatchObject({ suspendedAt: null })
        expect(admin.permissions.role).toBe('ADMIN')
    })

    it('un modérateur suspend un joueur ou un modérateur, jamais un administrateur (L7 D5)', () => {
        const moderator = accountWithRole('moderator', 'MODERATOR')

        accountWithRole('player', 'PLAYER').suspend(moderator, now)
        accountWithRole('other-moderator', 'MODERATOR').suspend(moderator, now)
        expect(() => accountWithRole('admin', 'ADMIN').suspend(moderator, now)).toThrow(
            expect.objectContaining({ code: 'FORBIDDEN', kind: 'FORBIDDEN' })
        )
    })

    it('changement de rôle : un administrateur promeut et rétrograde', () => {
        const admin = accountWithRole('admin', 'ADMIN')
        const other = accountWithRole('other', 'PLAYER')

        other.changeRole(admin, 'ADMIN')
        expect(other.permissions.role).toBe('ADMIN')
        other.changeRole(admin, 'MODERATOR')
        expect(other.permissions.role).toBe('MODERATOR')
    })

    it('rôle attribué plus privilégié que l’acteur → FORBIDDEN, rôle inchangé', () => {
        const moderator = accountWithRole('moderator', 'MODERATOR')
        const player = accountWithRole('player', 'PLAYER')

        expect(() => player.changeRole(moderator, 'ADMIN')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }))
        expect(player.permissions.role).toBe('PLAYER')
    })
})
