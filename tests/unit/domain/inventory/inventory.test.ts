import { describe, expect, it } from 'vitest'
import { Inventory } from '../../../../src/contexts/inventory/domain/inventory'
import { ItemStack } from '../../../../src/contexts/inventory/domain/item-stack'

const PELT = { id: 'item-pelt', code: 'wolf-pelt', name: 'Peau de loup' }
const TUSK = { id: 'item-tusk', code: 'boar-tusk', name: 'Défense de sanglier' }

describe('ItemStack', () => {
    it('quantité entière ≥ 1, empilable sans limite', () => {
        expect(ItemStack.of(PELT, 1).add(Number.MAX_SAFE_INTEGER - 1).quantity).toBe(Number.MAX_SAFE_INTEGER)
    })

    it.each([0, -1, 1.5, Number.NaN])('quantité invalide %s → erreur de programmation', (quantity) => {
        expect(() => ItemStack.of(PELT, quantity)).toThrow('Quantité')
    })
})

describe('Inventory', () => {
    it('un personnage sans objet a un inventaire vide (rules.md §10)', () => {
        const inventory = Inventory.restore('character-1', [])

        expect(inventory.items).toEqual([])
        expect(inventory.pendingAdditions).toEqual([])
    })

    it('empile les objets d’un même type et trie les piles par nom', () => {
        const inventory = Inventory.restore('character-1', [ItemStack.of(PELT, 2)])

        const added = inventory.add(PELT, 1)
        inventory.add(TUSK, 1)
        inventory.add(PELT, 1)

        expect(added).toMatchObject({ item: PELT, quantity: 1 })
        expect(inventory.items.map(({ item, quantity }) => [item.name, quantity])).toEqual([
            ['Défense de sanglier', 1],
            ['Peau de loup', 4]
        ])
        // Seuls les ajouts sont enregistrés, par incrément (L4 D1).
        expect(inventory.pendingAdditions.map(({ item, quantity }) => [item.code, quantity])).toEqual([
            ['wolf-pelt', 2],
            ['boar-tusk', 1]
        ])
    })

    it('refuse un état reconstruit avec deux piles du même objet', () => {
        expect(() => Inventory.restore('character-1', [ItemStack.of(PELT, 1), ItemStack.of(PELT, 2)])).toThrow('double')
    })
})
