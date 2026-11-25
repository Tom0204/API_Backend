import { STARTING_ZONE_CODE } from '../../domain/shared/game-rules'
import type { PrismaClient } from '../../generated/prisma/client'

/** Identifiant de la zone de départ (rules.md §8), lu une fois au démarrage. */
export async function findStartingZoneId(prisma: PrismaClient): Promise<string> {
    const zone = await prisma.zone.findUnique({ where: { code: STARTING_ZONE_CODE }, select: { id: true } })
    if (!zone) {
        throw new Error(`Zone de départ "${STARTING_ZONE_CODE}" introuvable : lancer npm run db:seed`)
    }
    return zone.id
}
