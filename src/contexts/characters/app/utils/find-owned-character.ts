import type { Character } from '../../domain/character'
import { characterErrors } from '../../domain/character-errors'
import type { CharacterRepository } from '../interfaces/character-repository'

/** Personnage du compte ; celui d'un autre joueur est traité exactement comme un inexistant (AGENTS.md §5). */
export async function findOwnedCharacter(
    characters: CharacterRepository,
    characterId: string,
    accountId: string
): Promise<Character> {
    const character = await characters.findById(characterId)
    if (!character?.isOwnedBy(accountId)) {
        throw characterErrors.notFound()
    }
    return character
}
