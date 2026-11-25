import { Inventory } from '../../domain/inventory/inventory'
import type { InventoryRepository } from '../../domain/inventory/inventory-repository'
import { ItemStack } from '../../domain/inventory/item-stack'
import type { Prisma } from '../../generated/prisma/client'

export function createPrismaInventoryRepository(tx: Prisma.TransactionClient): InventoryRepository {
    return {
        async findByCharacter(characterId) {
            const rows = await tx.inventoryItem.findMany({ where: { characterId }, include: { item: true } })
            return Inventory.restore(
                characterId,
                rows.map((row) => ItemStack.of({ id: row.item.id, code: row.item.code, name: row.item.name }, row.quantity))
            )
        },

        async save(inventory) {
            // Incrément atomique (L4 D1) : aucun ajout perdu, même si deux transactions écrivent la même pile.
            for (const added of inventory.pendingAdditions) {
                await tx.$executeRaw`
                    INSERT INTO inventory_items (character_id, item_id, quantity)
                    VALUES (${inventory.characterId}::uuid, ${added.item.id}::uuid, ${added.quantity})
                    ON CONFLICT (character_id, item_id)
                    DO UPDATE SET quantity = inventory_items.quantity + EXCLUDED.quantity`
            }
        }
    }
}
