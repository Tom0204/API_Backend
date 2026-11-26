import type { EventHandler } from '../../../../shared/app/event-publisher'
import type { RandomSource } from '../../../../shared/app/random-source'
import type { DomainEvent } from '../../../../shared/domain/domain-event'
import { LOOT_QUANTITY } from '../../../../shared/domain/game-rules'
import type { LootAwarded } from '../../domain/inventory-events'
import { isCombatWon } from '../interfaces/combat-won'
import type { InventoryRepository } from '../interfaces/inventory-repository'
import type { LootTables } from '../interfaces/loot-tables'

type Transaction = { inventories: InventoryRepository; lootTables: LootTables }

/** `CombatWon` → tirage du butin par `RandomSource` (rules.md §7), ajout à l'inventaire, puis `LootAwarded`. */
export function createAwardCombatLoot({ random }: { random: RandomSource }): EventHandler<Transaction> {
    return {
        name: 'inventory.awardCombatLoot',
        eventTypes: ['CombatWon'],
        async handle(event, { inventories, lootTables }): Promise<readonly DomainEvent[]> {
            if (!isCombatWon(event)) throw new Error(`Événement inattendu : ${event.type}`)
            const item = await lootTables.roll(event.monsterId, random.next())
            if (!item) return []

            // Lecture sans verrou : l'ajout est un incrément atomique en base (L4 D1), et le personnage est déjà
            // verrouillé par le handler d'XP, enregistré avant celui-ci (platform/events/event-handlers.ts).
            const inventory = await inventories.findByCharacter(event.characterId)
            const added = inventory.add(item, LOOT_QUANTITY)
            await inventories.save(inventory)
            const awarded: LootAwarded = {
                type: 'LootAwarded',
                occurredAt: event.occurredAt,
                characterId: event.characterId,
                combatId: event.combatId,
                item: { ...added.item },
                quantity: added.quantity
            }
            return [awarded]
        }
    }
}
