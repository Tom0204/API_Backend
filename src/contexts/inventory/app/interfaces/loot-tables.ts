import type { InventoryItem } from '../../domain/item-stack'

/** Ce que inventory attend des monstres ; fourni par le contexte world, qui applique la règle r < p (rules.md §7). */
export interface LootTables {
    /** Objet obtenu pour le tirage r dans [0, 1[, ou `null`. */
    roll(monsterId: string, r: number): Promise<InventoryItem | null>
}
