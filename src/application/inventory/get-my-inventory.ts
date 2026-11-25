import type { Inventory } from '../../domain/inventory/inventory'
import { findOwnedCharacter } from '../characters/find-owned-character'
import type { GetMyCharacterQuery } from '../characters/get-my-character'
import type { UnitOfWork } from '../ports/unit-of-work'

/** Inventaire d'un personnage du compte ; celui d'un autre joueur → `CHARACTER_NOT_FOUND` (404). */
export function createGetMyInventory({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        execute: ({ accountId, characterId }: GetMyCharacterQuery): Promise<Inventory> =>
            unitOfWork.run(async ({ characters, inventories }) => {
                const character = await findOwnedCharacter(characters, characterId, accountId)
                return inventories.findByCharacter(character.id)
            })
    }
}

export type GetMyInventory = ReturnType<typeof createGetMyInventory>
