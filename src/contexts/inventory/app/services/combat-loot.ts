import type { InventoryItem } from '../../domain/item-stack'
import type { InventoryRepository } from '../interfaces/inventory-repository'

/**
 * Ce que inventory offre au combat : empiler le butin (rules.md §10). Aucun import du contexte combat
 * (typage structurel, vérifié à l'assemblage dans `platform/transaction.ts`).
 */
export function createCombatLoot({ inventories }: { inventories: InventoryRepository }) {
    return {
        async give(characterId: string, item: InventoryItem, quantity: number) {
            const inventory = await inventories.findByCharacter(characterId)
            const added = inventory.add(item, quantity)
            await inventories.save(inventory)
            return { ...added.item, quantity: added.quantity }
        }
    }
}
