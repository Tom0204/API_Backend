import type { UnitOfWork } from '../../application/ports/unit-of-work'
import type { PrismaClient } from '../../generated/prisma/client'
import { createPrismaAccountRepository } from './prisma-account-repository'
import { createPrismaCharacterClassRepository } from './prisma-character-class-repository'
import { createPrismaCharacterRepository } from './prisma-character-repository'
import { createPrismaCombatRepository } from './prisma-combat-repository'
import { createPrismaInventoryRepository } from './prisma-inventory-repository'
import { createPrismaSessionRepository } from './prisma-session-repository'
import { createPrismaWorldRepository } from './prisma-world-repository'

/** Une transaction PostgreSQL par appel : validée si `work` réussit, annulée si `work` lève une erreur. */
export function createPrismaUnitOfWork(prisma: PrismaClient): UnitOfWork {
    return {
        run: (work) =>
            prisma.$transaction((tx) =>
                work({
                    accounts: createPrismaAccountRepository(tx),
                    sessions: createPrismaSessionRepository(tx),
                    characters: createPrismaCharacterRepository(tx),
                    classes: createPrismaCharacterClassRepository(tx),
                    world: createPrismaWorldRepository(tx),
                    combats: createPrismaCombatRepository(tx),
                    inventories: createPrismaInventoryRepository(tx)
                })
            )
    }
}
