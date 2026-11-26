import type { CheckHealth } from './check-health'
import { asyncHandler } from '../http/async-handler'
import { success } from '../http/http-response'
import { presentHealth } from './health.presenter'

/** Lire, appeler, présenter : aucune règle métier. */
export function createHealthController({ checkHealth }: { checkHealth: CheckHealth }) {
    return {
        get: asyncHandler(async (_req, res) => {
            const report = await checkHealth.execute()
            res.status(200).json(success('Service is healthy', presentHealth(report)))
        })
    }
}
