import { RefreshToken } from '../domain/refresh-token'
import { Session } from '../domain/session'
import type { SessionRepository } from '../app/interfaces/session-repository'
import type { Prisma } from '../../../generated/prisma/client'

type SessionRow = {
    id: string
    accountId: string
    accessTokenHash: string
    accessExpiresAt: Date
    expiresAt: Date
    revokedAt: Date | null
}

export function createPrismaSessionRepository(tx: Prisma.TransactionClient): SessionRepository {
    return {
        async findByAccessTokenHash(accessTokenHash) {
            const row = await tx.session.findUnique({ where: { accessTokenHash } })
            return row ? toSession(row) : undefined
        },

        async findByIdForUpdate(id) {
            await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${id}::uuid FOR UPDATE`
            const row = await tx.session.findUnique({ where: { id } })
            return row ? toSession(row) : undefined
        },

        async findByRefreshTokenHashForUpdate(refreshTokenHash) {
            // Ordre fixe : jeton puis session. Le second rafraîchissement attend ici, puis lit `used_at` à jour.
            const [locked] = await tx.$queryRaw<{ session_id: string }[]>`
                SELECT session_id FROM refresh_tokens WHERE token_hash = ${refreshTokenHash} FOR UPDATE`
            if (!locked) return undefined
            await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${locked.session_id}::uuid FOR UPDATE`

            const token = await tx.refreshToken.findUnique({ where: { tokenHash: refreshTokenHash }, include: { session: true } })
            if (!token) return undefined
            return {
                session: toSession(token.session),
                refreshToken: RefreshToken.restore({
                    id: token.id,
                    sessionId: token.sessionId,
                    tokenHash: token.tokenHash,
                    usedAt: token.usedAt
                })
            }
        },

        async insert({ refreshTokenHash, ...session }) {
            const row = await tx.session.create({
                data: { ...session, refreshTokens: { create: { tokenHash: refreshTokenHash } } }
            })
            return toSession(row)
        },

        async save(session) {
            const { id, accessTokenHash, accessExpiresAt, revokedAt } = session.snapshot
            const { usedRefreshTokenIds, newRefreshTokenHashes, usedAt } = session.changes
            await tx.session.update({ where: { id }, data: { accessTokenHash, accessExpiresAt, revokedAt } })
            if (usedRefreshTokenIds.length > 0) {
                await tx.refreshToken.updateMany({
                    where: { id: { in: [...usedRefreshTokenIds] }, sessionId: id },
                    data: { usedAt }
                })
            }
            if (newRefreshTokenHashes.length > 0) {
                await tx.refreshToken.createMany({
                    data: newRefreshTokenHashes.map((tokenHash) => ({ sessionId: id, tokenHash }))
                })
            }
        },

        async revokeAllByAccount(accountId, now) {
            const { count } = await tx.session.updateMany({
                where: { accountId, revokedAt: null },
                data: { revokedAt: now }
            })
            return count
        }
    }
}

function toSession(row: SessionRow): Session {
    return Session.restore({
        id: row.id,
        accountId: row.accountId,
        accessTokenHash: row.accessTokenHash,
        accessExpiresAt: row.accessExpiresAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt
    })
}
