import { type RequestHandler, Router } from 'express'
import type { GetLeaderboard } from '../app/use-cases/get-leaderboard'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { validate } from '../../../platform/http/middlewares/validate'
import { presentLeaderboardEntry } from './leaderboard.presenter'
import { leaderboardQuery } from './leaderboard.schemas'

export interface LeaderboardUseCases {
    getLeaderboard: GetLeaderboard
}

/** `GET /api/v1/leaderboard` (PROD-02) : réservé aux joueurs, paginé par `limit` et `offset`. */
export function createLeaderboardRoutes(deps: LeaderboardUseCases & { requirePlayer: RequestHandler }): Router {
    const { requirePlayer, getLeaderboard } = deps
    const router = Router()

    router.get(
        '/api/v1/leaderboard',
        requirePlayer,
        validate({ query: leaderboardQuery }),
        asyncHandler(async (req, res) => {
            const page = leaderboardQuery.parse(req.query) // déjà validé : typage sans transtypage
            const entries = await getLeaderboard.execute(page)
            res.status(200).json(success('Leaderboard retrieved successfully', entries.map(presentLeaderboardEntry)))
        })
    )

    return router
}
