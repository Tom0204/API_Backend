import type { CharacterRepository } from '../interfaces/character-repository'

/** Ce que characters offre aux contextes qui vérifient la propriété d'un personnage (inventory). */
export function createCharacterOwners({ characters }: { characters: CharacterRepository }) {
    return {
        async isOwnedBy(characterId: string, accountId: string) {
            return (await characters.findById(characterId))?.isOwnedBy(accountId) === true
        }
    }
}
