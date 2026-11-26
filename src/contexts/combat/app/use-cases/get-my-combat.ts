import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { CombatFighters } from '../interfaces/combat-fighters'
import type { CombatRepository } from '../interfaces/combat-repository'
import { type CombatView, toCombatView } from '../utils/combat-output'
import { ensureCombatOwnedBy } from '../utils/find-owned-combat'

type Transaction = { combats: CombatRepository; fighters: Pick<CombatFighters, 'isOwnedBy'> }

export function createGetMyCombat({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        /** Consultation : aucun tour n'est joué, `lastTurn` et `rewards` valent `null` (L3 D2, L4 D2). */
        execute: ({ accountId, combatId }: { accountId: string; combatId: string }): Promise<CombatView> =>
            unitOfWork.run(async ({ combats, fighters }) =>
                toCombatView(await ensureCombatOwnedBy(await combats.findById(combatId), fighters, accountId), null, null)
            )
    }
}

export type GetMyCombat = ReturnType<typeof createGetMyCombat>
