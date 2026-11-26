import { createGrantCombatExperience } from '../../contexts/characters/app/handlers/grant-combat-experience'
import { createAwardCombatLoot } from '../../contexts/inventory/app/handlers/award-combat-loot'
import { createRecordGameEvent } from '../../contexts/journal/app/handlers/record-game-event'
import type { EventHandler } from '../../shared/app/event-publisher'
import type { RandomSource } from '../../shared/app/random-source'
import type { AppTransaction } from '../transaction'

/**
 * Seul registre des handlers. L'ordre est celui d'exécution pour un même événement : characters (XP, verrou sur le
 * personnage après celui du combat), puis inventory (butin), puis journal (qui enregistre tout).
 */
export function createEventHandlers({ random }: { random: RandomSource }): readonly EventHandler<AppTransaction>[] {
    return [createGrantCombatExperience(), createAwardCombatLoot({ random }), createRecordGameEvent()]
}
