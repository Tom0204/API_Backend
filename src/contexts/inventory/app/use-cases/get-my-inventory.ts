import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { inventoryErrors } from '../../domain/inventory-errors'
import type { CharacterOwners } from '../interfaces/character-owners'
import type { InventoryRepository } from '../interfaces/inventory-repository'

export interface GetMyInventoryInput {
    accountId: string
    characterId: string
}

/** Pile d'objets (L4 D3). */
export interface InventoryItemOutput {
    itemId: string
    code: string
    name: string
    quantity: number
}

type Transaction = { characterOwners: CharacterOwners; inventories: InventoryRepository }

/** Inventaire d'un personnage du compte, piles triées par nom ; celui d'un autre joueur → `CHARACTER_NOT_FOUND`. */
export function createGetMyInventory({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: ({ accountId, characterId }: GetMyInventoryInput): Promise<InventoryItemOutput[]> =>
            unitOfWork.run(async ({ characterOwners, inventories }) => {
                if (!(await characterOwners.isOwnedBy(characterId, accountId))) throw inventoryErrors.characterNotFound()
                const inventory = await inventories.findByCharacter(characterId)
                return inventory.items.map(({ item, quantity }) => ({ itemId: item.id, code: item.code, name: item.name, quantity }))
            })
    }
}

export type GetMyInventory = ReturnType<typeof createGetMyInventory>
