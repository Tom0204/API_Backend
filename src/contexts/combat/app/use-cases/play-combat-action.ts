import type { Clock } from '../../../../shared/app/clock'
import type { RandomSource } from '../../../../shared/app/random-source'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { CombatFighters } from '../interfaces/combat-fighters'
import type { CombatLoot } from '../interfaces/combat-loot'
import type { CombatMonsters } from '../interfaces/combat-monsters'
import type { CombatRepository } from '../interfaces/combat-repository'
import { type CombatView, toCombatView } from '../utils/combat-output'
import { ensureCombatOwnedBy } from '../utils/find-owned-combat'
import { grantVictoryRewards } from '../utils/grant-victory-rewards'

export interface PlayCombatActionInput {
    accountId: string
    combatId: string
    /** Seule action du MVP (rules.md §6). */
    type: 'ATTACK'
}

type Transaction = {
    combats: CombatRepository
    fighters: Pick<CombatFighters, 'isOwnedBy' | 'grantExperience'>
    monsters: CombatMonsters
    loot: CombatLoot
}

export function createPlayCombatAction({
    unitOfWork,
    clock,
    random
}: {
    unitOfWork: UnitOfWork<Transaction>
    clock: Clock
    random: RandomSource
}) {
    return {
        /** Un seul `UnitOfWork` : action finale, XP et butin sont validés ensemble ou annulés ensemble (REWARD-01). */
        execute: (input: PlayCombatActionInput): Promise<CombatView> =>
            unitOfWork.run(async (transaction) => {
                const { combats, fighters } = transaction
                // Verrou sur le combat : deux actions simultanées s'exécutent l'une après l'autre.
                const combat = await ensureCombatOwnedBy(await combats.findByIdForUpdate(input.combatId), fighters, input.accountId)
                const lastTurn = combat.attack(clock.now()) // COMBAT_FINISHED si le combat est terminé
                await combats.save(combat)
                // Défaite : ni XP, ni butin, ni pénalité (rules.md §7).
                const rewards =
                    combat.snapshot.status === 'VICTORY' ? await grantVictoryRewards(combat, transaction, random) : null
                return toCombatView(combat, lastTurn, rewards)
            })
    }
}

export type PlayCombatAction = ReturnType<typeof createPlayCombatAction>
