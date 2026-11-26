import type { DomainEvent } from '../../../shared/domain/domain-event'
import type { InventoryItem } from './item-stack'

/** Butin ajouté à l'inventaire par une victoire (rules.md §7, §10). */
export interface LootAwarded extends DomainEvent {
    readonly type: 'LootAwarded'
    readonly characterId: string
    readonly combatId: string
    readonly item: InventoryItem
    readonly quantity: number
}
