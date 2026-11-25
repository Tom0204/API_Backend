import type { Clock } from '../ports/clock'
import type { RandomSource } from '../ports/random-source'
import type { UnitOfWork } from '../ports/unit-of-work'
import { ensureCombatOwnedBy } from './find-owned-combat'
import { grantVictoryRewards } from './grant-victory-rewards'
import type { CombatTurnView } from './start-combat'

export interface PlayCombatActionCommand {
    accountId: string
    combatId: string
    /** Seule action du MVP (rules.md §6). */
    type: 'ATTACK'
}

export function createPlayCombatAction({
    unitOfWork,
    clock,
    random
}: {
    unitOfWork: UnitOfWork
    clock: Clock
    random: RandomSource
}) {
    return {
        /** Un seul `UnitOfWork` : action finale, XP et butin sont validés ensemble ou annulés ensemble (REWARD-01). */
        execute: (command: PlayCombatActionCommand): Promise<CombatTurnView> =>
            unitOfWork.run(async (repositories) => {
                const { combats, characters } = repositories
                // Verrou sur le combat : deux actions simultanées s'exécutent l'une après l'autre.
                const combat = await ensureCombatOwnedBy(
                    await combats.findByIdForUpdate(command.combatId),
                    characters,
                    command.accountId
                )
                const lastTurn = combat.attack(clock.now()) // COMBAT_FINISHED si le combat est terminé
                await combats.save(combat)
                // Défaite : ni XP, ni butin, ni pénalité (rules.md §7).
                const rewards =
                    combat.snapshot.status === 'VICTORY' ? await grantVictoryRewards(combat, repositories, random) : null
                return { combat, lastTurn, rewards }
            })
    }
}

export type PlayCombatAction = ReturnType<typeof createPlayCombatAction>
