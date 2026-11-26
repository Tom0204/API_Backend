import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { validate } from '../../../platform/http/middlewares/validate'
import type { ListZoneMonsters, MonsterOutput } from '../app/use-cases/list-zone-monsters'

const zoneParams = z.strictObject({ zoneId: z.uuid('Must be a valid UUID') })

/** Liste blanche (L3 D1) : statistiques et XP, sans le butin. */
export function presentMonster({ id, code, name, level, stats, xpReward }: MonsterOutput) {
    const { hp, attack, defense, speed } = stats
    return { id, code, name, level, stats: { hp, attack, defense, speed }, xpReward }
}

/** `GET /api/v1/zones/:zoneId/monsters` : protégée, lecture des données de référence. */
export function createWorldRoutes({
    listZoneMonsters,
    requirePlayer
}: {
    listZoneMonsters: ListZoneMonsters
    requirePlayer: RequestHandler
}): Router {
    const router = Router()
    router.get(
        '/api/v1/zones/:zoneId/monsters',
        requirePlayer,
        validate({ params: zoneParams }),
        asyncHandler(async (req, res) => {
            const { zoneId } = zoneParams.parse(req.params)
            const monsters = await listZoneMonsters.execute({ zoneId })
            res.status(200).json(success('Monsters retrieved successfully', monsters.map(presentMonster)))
        })
    )
    return router
}
