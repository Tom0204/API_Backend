import type { Inventory } from './inventory'

export interface InventoryRepository {
    /** Inventaire du personnage ; vide s'il n'a encore aucun objet (aucune ligne en base, L4 D1). */
    findByCharacter(characterId: string): Promise<Inventory>
    /** Enregistre les ajouts de `inventory.pendingAdditions`, par incrément atomique des quantités. */
    save(inventory: Inventory): Promise<void>
}
