import { describe, expect, it } from 'vitest'
import { Session, SESSION_DURATION_MS } from '../../../../src/contexts/identity/domain/session'

describe('Session', () => {
    const now = new Date('2026-11-25T10:00:00.000Z')
    const opened = Session.open({ accountId: 'account-1', tokenHash: 'hash', now })
    const session = Session.restore({ id: 'session-1', ...opened })

    it('expire 24 h après son ouverture', () => {
        expect(SESSION_DURATION_MS).toBe(24 * 60 * 60 * 1000)
        expect(opened.expiresAt.toISOString()).toBe('2026-11-26T10:00:00.000Z')
    })

    it("est valide jusqu'à la dernière milliseconde, expirée à l'instant exact", () => {
        expect(session.isExpiredAt(new Date(now.getTime() + SESSION_DURATION_MS - 1))).toBe(false)
        expect(session.isExpiredAt(new Date(now.getTime() + SESSION_DURATION_MS))).toBe(true)
    })

    it("ne conserve que l'empreinte du jeton", () => {
        expect(opened).toEqual({ accountId: 'account-1', tokenHash: 'hash', expiresAt: opened.expiresAt })
    })
})
