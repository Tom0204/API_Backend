import type { Clock } from '../ports/clock'
import type { UnitOfWork } from '../ports/unit-of-work'
import { ensureCombatOwnedBy } from './find-owned-combat'
import type { CombatTurnView } from './start-combat'

export interface PlayCombatActionCommand {
    accountId: string
    combatId: string
    /** Seule action du MVP (rules.md §6). */
    type: 'ATTACK'
}

export function createPlayCombatAction({ unitOfWork, clock }: { unitOfWork: UnitOfWork; clock: Clock }) {
    return {
        execute: (command: PlayCombatActionCommand): Promise<CombatTurnView> =>
            unitOfWork.run(async ({ combats, characters }) => {
                // Verrou sur le combat : deux actions simultanées s'exécutent l'une après l'autre.
                const combat = await ensureCombatOwnedBy(
                    await combats.findByIdForUpdate(command.combatId),
                    characters,
                    command.accountId
                )
                const lastTurn = combat.attack(clock.now()) // COMBAT_FINISHED si le combat est terminé
                await combats.save(combat)
                return { combat, lastTurn }
            })
    }
}

export type PlayCombatAction = ReturnType<typeof createPlayCombatAction>
