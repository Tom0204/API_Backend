import { describe, expect, it } from 'vitest'
import { characterErrors } from '../../../src/contexts/characters/domain/character-errors'
import { combatErrors } from '../../../src/contexts/combat/domain/combat-errors'
import { inventoryErrors } from '../../../src/contexts/inventory/domain/inventory-errors'

// Un code partagé par plusieurs contextes est déclaré dans chacun (aucun import entre contextes, AGENTS.md §4) :
// ce test garantit que les copies restent identiques. Seul `kind` varie (URL → 404, corps → 422, conventions.md §5).
describe('CHARACTER_NOT_FOUND, déclaré par characters, combat et inventory', () => {
    it('même code et même message partout ; 404 depuis l’URL, 422 depuis le corps', () => {
        const declarations = [
            [characterErrors.notFound(), 'NOT_FOUND'],
            [characterErrors.notFoundInBody(), 'RULE_VIOLATION'],
            [inventoryErrors.characterNotFound(), 'NOT_FOUND'],
            [combatErrors.characterNotFound(), 'RULE_VIOLATION']
        ] as const

        for (const [error, kind] of declarations) {
            expect({ code: error.code, message: error.message, kind: error.kind }).toEqual({
                code: 'CHARACTER_NOT_FOUND',
                message: 'Character not found',
                kind
            })
        }
    })
})
