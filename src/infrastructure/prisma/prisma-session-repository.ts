import { Session } from '../../domain/identity/session'
import type { SessionRepository } from '../../domain/identity/session-repository'
import type { Prisma } from '../../generated/prisma/client'

type SessionRow = { id: string; accountId: string; tokenHash: string; expiresAt: Date }

export function createPrismaSessionRepository(tx: Prisma.TransactionClient): SessionRepository {
    return {
        async findByTokenHash(tokenHash) {
            const row = await tx.session.findUnique({ where: { tokenHash } })
            return row ? toSession(row) : undefined
        },

        async insert(session) {
            const row = await tx.session.create({
                data: { accountId: session.accountId, tokenHash: session.tokenHash, expiresAt: session.expiresAt }
            })
            return toSession(row)
        }
    }
}

function toSession(row: SessionRow): Session {
    return Session.restore({
        id: row.id,
        accountId: row.accountId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt
    })
}
