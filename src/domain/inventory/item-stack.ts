/** Objet de référence (rules.md §10 : matériau sans effet), désigné par son identifiant. */
export interface InventoryItem {
    id: string
    code: string
    name: string
}

/** Pile d'objets d'un même type (rules.md §10) : quantité entière ≥ 1, sans limite. Immuable. */
export class ItemStack {
    private constructor(
        readonly item: Readonly<InventoryItem>,
        readonly quantity: number
    ) {}

    /** Une quantité invalide est une erreur de programmation (→ 500). */
    static of(item: InventoryItem, quantity: number): ItemStack {
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
            throw new Error(`Quantité d'objet invalide : ${quantity}`)
        }
        return new ItemStack({ ...item }, quantity)
    }

    add(quantity: number): ItemStack {
        return ItemStack.of(this.item, this.quantity + quantity)
    }
}
