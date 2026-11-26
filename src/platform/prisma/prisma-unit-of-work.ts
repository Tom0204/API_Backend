import { createPrismaCharacterClassRepository } from '../../contexts/characters/infra/prisma-character-class-repository'
import { createPrismaCharacterRepository } from '../../contexts/characters/infra/prisma-character-repository'
import { createPrismaCombatRepository } from '../../contexts/combat/infra/prisma-combat-repository'
import { createPrismaAccountRepository } from '../../contexts/identity/infra/prisma-account-repository'
import { createPrismaSessionRepository } from '../../contexts/identity/infra/prisma-session-repository'
import { createPrismaInventoryRepository } from '../../contexts/inventory/infra/prisma-inventory-repository'
import { createPrismaWorldRepository } from '../../contexts/world/infra/prisma-world-repository'
import type { PrismaClient } from '../../generated/prisma/client'
import type { UnitOfWork } from '../../shared/app/unit-of-work'
import { type AppTransaction, withContextServices } from '../transaction'

/** Une transaction PostgreSQL par appel : validée si `work` réussit, annulée si `work` lève une erreur. */
export function createPrismaUnitOfWork(prisma: PrismaClient): UnitOfWork<AppTransaction> {
    return {
        run: (work) =>
            prisma.$transaction((tx) =>
                work(
                    withContextServices({
                        accounts: createPrismaAccountRepository(tx),
                        sessions: createPrismaSessionRepository(tx),
                        characters: createPrismaCharacterRepository(tx),
                        classes: createPrismaCharacterClassRepository(tx),
                        world: createPrismaWorldRepository(tx),
                        combats: createPrismaCombatRepository(tx),
                        inventories: createPrismaInventoryRepository(tx)
                    })
                )
            )
    }
}
