import type { DomainEvent } from '../../../../shared/domain/domain-event'
import { isExperienceGranted, isLootAwarded } from '../interfaces/reward-events'
import type { RewardsOutput } from './combat-output'

/**
 * Récompenses d'une victoire (L4 D2), composées à partir des événements de suite de `CombatWon` (L5 D1).
 * Une victoire sans `ExperienceGranted` est une erreur de câblage des handlers (→ 500).
 */
export function rewardsFromEvents(events: readonly DomainEvent[], combatId: string): RewardsOutput {
    const granted = events.find((event) => isExperienceGranted(event) && event.combatId === combatId)
    if (!granted || !isExperienceGranted(granted)) throw new Error(`Aucune XP attribuée pour le combat ${combatId}`)
    const looted = events.find((event) => isLootAwarded(event) && event.combatId === combatId)
    return {
        experienceGained: granted.amount,
        levelsGained: granted.levelsGained,
        level: granted.level,
        experience: granted.experience,
        item: looted && isLootAwarded(looted) ? { ...looted.item, quantity: looted.quantity } : null
    }
}
