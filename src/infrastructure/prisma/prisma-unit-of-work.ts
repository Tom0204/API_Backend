import type { UnitOfWork } from '../../application/ports/unit-of-work'
import type { PrismaClient } from '../../generated/prisma/client'
import { createPrismaAccountRepository } from './prisma-account-repository'
import { createPrismaSessionRepository } from './prisma-session-repository'

/** Une transaction PostgreSQL par appel : validée si `work` réussit, annulée si `work` lève une erreur. */
export function createPrismaUnitOfWork(prisma: PrismaClient): UnitOfWork {
    return {
        run: (work) =>
            prisma.$transaction((tx) =>
                work({
                    accounts: createPrismaAccountRepository(tx),
                    sessions: createPrismaSessionRepository(tx)
                })
            )
    }
}
