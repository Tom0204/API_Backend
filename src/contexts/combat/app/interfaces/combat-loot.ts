import type { LootItem } from './combat-monsters'

/** Objets ajoutés à l'inventaire par une victoire. */
export interface LootedItem extends LootItem {
    quantity: number
}

/** Ce que le combat attend des inventaires ; fourni par le contexte inventory. */
export interface CombatLoot {
    /** Ajoute `quantity` objets à l'inventaire du personnage ; renvoie la pile ajoutée. */
    give(characterId: string, item: LootItem, quantity: number): Promise<LootedItem>
}
