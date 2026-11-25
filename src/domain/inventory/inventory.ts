import { type InventoryItem, ItemStack } from './item-stack'

/**
 * Inventaire d'un personnage (rules.md §10) : un par personnage, vide à sa création, objets empilés par type,
 * sans limite de capacité ni de pile. Référence le personnage par son identifiant.
 */
export class Inventory {
    /** Quantités ajoutées depuis la lecture, par objet : le repository les enregistre par incrément atomique (L4 D1). */
    private readonly additions = new Map<string, ItemStack>()

    private constructor(
        readonly characterId: string,
        private stacks: ItemStack[]
    ) {}

    static restore(characterId: string, stacks: ItemStack[]): Inventory {
        const itemIds = new Set(stacks.map((stack) => stack.item.id))
        if (itemIds.size !== stacks.length) throw new Error(`Inventaire invalide : objet en double (${characterId})`)
        return new Inventory(characterId, [...stacks])
    }

    /** Empile `quantity` objets du type `item` ; renvoie la pile ajoutée. */
    add(item: InventoryItem, quantity: number): ItemStack {
        const added = ItemStack.of(item, quantity)
        const existing = this.stacks.find((stack) => stack.item.id === item.id)
        this.stacks = existing
            ? this.stacks.map((stack) => (stack === existing ? stack.add(quantity) : stack))
            : [...this.stacks, added]
        const pending = this.additions.get(item.id)
        this.additions.set(item.id, pending ? pending.add(quantity) : added)
        return added
    }

    /** Piles triées par nom d'objet (L4 D3). */
    get items(): readonly ItemStack[] {
        return [...this.stacks].sort((a, b) => a.item.name.localeCompare(b.item.name))
    }

    /**
     * Ajouts non encore enregistrés. L'agrégat sert à une seule écriture par transaction : un second `save`
     * du même objet rejouerait ces incréments. Relire l'inventaire avant tout nouvel ajout.
     */
    get pendingAdditions(): readonly ItemStack[] {
        return [...this.additions.values()]
    }
}
