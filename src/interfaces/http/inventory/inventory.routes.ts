import { type RequestHandler, Router } from 'express'
import type { GetMyInventory } from '../../../application/inventory/get-my-inventory'
import type { Inventory } from '../../../domain/inventory/inventory'
import { asyncHandler } from '../async-handler'
import { characterParams } from '../characters/character.schemas'
import { success } from '../http-response'
import { getAuth } from '../middlewares/require-auth'
import { validate } from '../middlewares/validate'

/** Liste blanche (L4 D3) : piles triées par nom d'objet ; `[]` si l'inventaire est vide. */
export function presentInventory(inventory: Inventory) {
    return inventory.items.map(({ item, quantity }) => ({ itemId: item.id, code: item.code, name: item.name, quantity }))
}

/** `GET /api/v1/characters/:characterId/inventory` : protégée, lecture seule. */
export function createInventoryRoutes({
    getMyInventory,
    requireAuth
}: {
    getMyInventory: GetMyInventory
    requireAuth: RequestHandler
}): Router {
    const router = Router()
    router.get(
        '/api/v1/characters/:characterId/inventory',
        requireAuth,
        validate({ params: characterParams }),
        asyncHandler(async (req, res) => {
            const { characterId } = characterParams.parse(req.params) // déjà validé : typage sans transtypage
            const inventory = await getMyInventory.execute({ ...getAuth(req), characterId })
            res.status(200).json(success('Inventory retrieved successfully', presentInventory(inventory)))
        })
    )
    return router
}
