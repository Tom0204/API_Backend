import type { DomainEvent } from '../../../../shared/domain/domain-event'

/** `ExperienceGranted` vu par le combat (publié par characters en réponse à `CombatWon`). */
export interface ExperienceGrantedEvent extends DomainEvent {
    readonly type: 'ExperienceGranted'
    readonly combatId: string
    readonly amount: number
    readonly levelsGained: number
    readonly level: number
    readonly experience: number
}

export interface LootedItem {
    id: string
    code: string
    name: string
    quantity: number
}

/** `LootAwarded` vu par le combat (publié par inventory en réponse à `CombatWon`). */
export interface LootAwardedEvent extends DomainEvent {
    readonly type: 'LootAwarded'
    readonly combatId: string
    readonly item: { id: string; code: string; name: string }
    readonly quantity: number
}

export function isExperienceGranted(event: DomainEvent): event is ExperienceGrantedEvent {
    return (
        event.type === 'ExperienceGranted' &&
        'combatId' in event &&
        typeof event.combatId === 'string' &&
        'amount' in event &&
        typeof event.amount === 'number' &&
        'levelsGained' in event &&
        typeof event.levelsGained === 'number' &&
        'level' in event &&
        typeof event.level === 'number' &&
        'experience' in event &&
        typeof event.experience === 'number'
    )
}

export function isLootAwarded(event: DomainEvent): event is LootAwardedEvent {
    return (
        event.type === 'LootAwarded' &&
        'combatId' in event &&
        typeof event.combatId === 'string' &&
        'quantity' in event &&
        typeof event.quantity === 'number' &&
        'item' in event &&
        typeof event.item === 'object' &&
        event.item !== null &&
        'id' in event.item &&
        typeof event.item.id === 'string' &&
        'code' in event.item &&
        typeof event.item.code === 'string' &&
        'name' in event.item &&
        typeof event.item.name === 'string'
    )
}
