import { describe, expect, it } from 'vitest'
import { RefreshToken } from '../../../../src/contexts/identity/domain/refresh-token'
import {
    ACCESS_TOKEN_DURATION_MS,
    REFRESH_TOKEN_DURATION_MS,
    Session
} from '../../../../src/contexts/identity/domain/session'

const now = new Date('2026-11-25T10:00:00.000Z')
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

function openSession() {
    const opened = Session.open({ accountId: 'account-1', accessTokenHash: 'access-1', refreshTokenHash: 'refresh-1', now })
    const { refreshTokenHash: _first, ...props } = opened
    const session = Session.restore({ id: 'session-1', ...props })
    const firstToken = RefreshToken.restore({ id: 'token-1', sessionId: 'session-1', tokenHash: 'refresh-1', usedAt: null })
    return { opened, session, firstToken }
}

describe('Session (famille de sessions)', () => {
    it('durées : accès 15 min, famille 7 jours (L6 D1)', () => {
        expect(ACCESS_TOKEN_DURATION_MS).toBe(15 * 60 * 1000)
        expect(REFRESH_TOKEN_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000)
    })

    it("s'ouvre avec les seules empreintes des jetons, non révoquée", () => {
        const { opened } = openSession()

        expect(opened).toEqual({
            accountId: 'account-1',
            accessTokenHash: 'access-1',
            accessExpiresAt: new Date('2026-11-25T10:15:00.000Z'),
            expiresAt: new Date('2026-12-02T10:00:00.000Z'),
            revokedAt: null,
            refreshTokenHash: 'refresh-1'
        })
    })

    it("accepte le jeton d'accès jusqu'à la dernière milliseconde, le refuse à l'instant exact", () => {
        const { session } = openSession()

        expect(session.acceptsAccessAt(at(ACCESS_TOKEN_DURATION_MS - 1))).toBe(true)
        expect(session.acceptsAccessAt(at(ACCESS_TOKEN_DURATION_MS))).toBe(false)
    })

    it("se rafraîchit jusqu'à la fin de la famille exclue", () => {
        const { session } = openSession()

        expect(session.isRefreshableAt(at(REFRESH_TOKEN_DURATION_MS - 1))).toBe(true)
        expect(session.isRefreshableAt(at(REFRESH_TOKEN_DURATION_MS))).toBe(false)
    })

    it("rotation : nouveau jeton d'accès de 15 min, jeton présenté consommé, nouveau jeton émis", () => {
        const { session, firstToken } = openSession()

        session.rotate(firstToken, { accessTokenHash: 'access-2', refreshTokenHash: 'refresh-2' }, at(60_000))

        expect(session.snapshot.accessTokenHash).toBe('access-2')
        expect(session.snapshot.accessExpiresAt).toEqual(at(60_000 + ACCESS_TOKEN_DURATION_MS))
        expect(session.snapshot.expiresAt).toEqual(at(REFRESH_TOKEN_DURATION_MS)) // non glissante
        expect(session.changes).toEqual({
            usedRefreshTokenIds: ['token-1'],
            newRefreshTokenHashes: ['refresh-2'],
            usedAt: at(60_000)
        })
    })

    it("le jeton d'accès n'expire jamais après la famille", () => {
        const { session, firstToken } = openSession()
        const late = at(REFRESH_TOKEN_DURATION_MS - 60_000)

        session.rotate(firstToken, { accessTokenHash: 'access-2', refreshTokenHash: 'refresh-2' }, late)

        expect(session.snapshot.accessExpiresAt).toEqual(at(REFRESH_TOKEN_DURATION_MS))
    })

    it('rotation impossible (invariants) : jeton utilisé, d’une autre session, session révoquée ou échue', () => {
        const tokens = { accessTokenHash: 'access-2', refreshTokenHash: 'refresh-2' }
        const used = RefreshToken.restore({ id: 't', sessionId: 'session-1', tokenHash: 'h', usedAt: now })
        const foreign = RefreshToken.restore({ id: 't', sessionId: 'session-2', tokenHash: 'h', usedAt: null })

        expect(() => openSession().session.rotate(used, tokens, now)).toThrow()
        expect(() => openSession().session.rotate(foreign, tokens, now)).toThrow()
        const { session, firstToken } = openSession()
        expect(() => session.rotate(firstToken, tokens, at(REFRESH_TOKEN_DURATION_MS))).toThrow()
        session.revoke(now)
        expect(() => session.rotate(firstToken, tokens, now)).toThrow()
    })

    it("révocation : plus d'accès ni de rafraîchissement ; une seconde révocation garde la première date", () => {
        const { session } = openSession()

        session.revoke(at(1000))
        session.revoke(at(2000))

        expect(session.isRevoked).toBe(true)
        expect(session.snapshot.revokedAt).toEqual(at(1000))
        expect(session.acceptsAccessAt(at(1000))).toBe(false)
        expect(session.isRefreshableAt(at(1000))).toBe(false)
    })
})
