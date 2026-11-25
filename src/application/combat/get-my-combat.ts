import type { UnitOfWork } from '../ports/unit-of-work'
import { ensureCombatOwnedBy } from './find-owned-combat'
import type { CombatTurnView } from './start-combat'

export function createGetMyCombat({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        /** Consultation : aucun tour n'est joué, `lastTurn` vaut `null` (L3 D2). */
        execute: ({ accountId, combatId }: { accountId: string; combatId: string }): Promise<CombatTurnView> =>
            unitOfWork.run(async ({ combats, characters }) => ({
                combat: await ensureCombatOwnedBy(await combats.findById(combatId), characters, accountId),
                lastTurn: null
            }))
    }
}

export type GetMyCombat = ReturnType<typeof createGetMyCombat>
