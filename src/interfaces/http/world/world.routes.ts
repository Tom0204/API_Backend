import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import type { ListZoneMonsters } from '../../../application/world/list-zone-monsters'
import type { MonsterTemplate } from '../../../domain/world/monster-template'
import { asyncHandler } from '../async-handler'
import { success } from '../http-response'
import { validate } from '../middlewares/validate'

const zoneParams = z.strictObject({ zoneId: z.uuid('Must be a valid UUID') })

/** Liste blanche (L3 D1) : statistiques et XP, sans le butin. */
export function presentMonster(monster: MonsterTemplate) {
    const { id, code, name, level, hp, attack, defense, speed, xpReward } = monster.snapshot
    return { id, code, name, level, stats: { hp, attack, defense, speed }, xpReward }
}

/** `GET /api/v1/zones/:zoneId/monsters` : protégée, lecture des données de référence. */
export function createWorldRoutes({
    listZoneMonsters,
    requireAuth
}: {
    listZoneMonsters: ListZoneMonsters
    requireAuth: RequestHandler
}): Router {
    const router = Router()
    router.get(
        '/api/v1/zones/:zoneId/monsters',
        requireAuth,
        validate({ params: zoneParams }),
        asyncHandler(async (req, res) => {
            const { zoneId } = zoneParams.parse(req.params)
            const monsters = await listZoneMonsters.execute({ zoneId })
            res.status(200).json(success('Monsters retrieved successfully', monsters.map(presentMonster)))
        })
    )
    return router
}
