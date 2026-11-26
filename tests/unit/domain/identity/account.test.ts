import { describe, expect, it } from 'vitest'
import {
    Account,
    LOGIN_LOCK_DURATION_MS,
    MAX_FAILED_LOGIN_ATTEMPTS
} from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'

const now = new Date('2026-11-25T10:00:00.000Z')
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

function newAccount(failedLoginCount = 0, lockedUntil: Date | null = null) {
    return Account.restore({
        id: 'account-1',
        email: Email.create('alice@example.com'),
        passwordHash: 'hash',
        failedLoginCount,
        lockedUntil,
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
