import type { Clock } from '../../../../shared/app/clock'
import type { EventPublisher } from '../../../../shared/app/event-publisher'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { CombatFighters } from '../interfaces/combat-fighters'
import type { CombatRepository } from '../interfaces/combat-repository'
import { type CombatView, toCombatView } from '../utils/combat-output'
import { rewardsFromEvents } from '../utils/combat-rewards'
import { ensureCombatOwnedBy } from '../utils/find-owned-combat'

export interface PlayCombatActionInput {
    accountId: string
    combatId: string
    /** Seule action du MVP (rules.md §6). */
    type: 'ATTACK'
}

type Transaction = {
    combats: CombatRepository
    fighters: Pick<CombatFighters, 'isOwnedBy'>
    events: EventPublisher
}

export function createPlayCombatAction({ unitOfWork, clock }: { unitOfWork: UnitOfWork<Transaction>; clock: Clock }) {
    return {
        /**
         * Un seul `UnitOfWork` : action, puis événements (`CombatWon` → XP et butin par les handlers de characters
         * et inventory), validés ensemble ou annulés ensemble (REWARD-01, EVT-02).
         */
        execute: (input: PlayCombatActionInput): Promise<CombatView> =>
            unitOfWork.run(async ({ combats, fighters, events }) => {
                // Verrou sur le combat : deux actions simultanées s'exécutent l'une après l'autre ; la seconde
                // lève COMBAT_FINISHED, donc `CombatWon` n'est publié qu'une fois.
                const combat = await ensureCombatOwnedBy(await combats.findByIdForUpdate(input.combatId), fighters, input.accountId)
                const lastTurn = combat.attack(clock.now()) // COMBAT_FINISHED si le combat est terminé
                await combats.save(combat)
                const published = await events.publish(combat.pullEvents())
                // Défaite : ni XP, ni butin, ni pénalité (rules.md §7).
                const rewards = combat.snapshot.status === 'VICTORY' ? rewardsFromEvents(published, combat.id) : null
                return toCombatView(combat, lastTurn, rewards)
            })
    }
}

export type PlayCombatAction = ReturnType<typeof createPlayCombatAction>
