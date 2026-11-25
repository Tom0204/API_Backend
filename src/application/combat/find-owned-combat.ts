import type { CharacterRepository } from '../../domain/characters/character-repository'
import type { Combat } from '../../domain/combat/combat'
import { combatErrors } from '../../domain/combat/combat-errors'

/** Le combat appartient au propriétaire de son personnage ; celui d'un autre joueur = inexistant. */
export async function ensureCombatOwnedBy(
    combat: Combat | undefined,
    characters: CharacterRepository,
    accountId: string
): Promise<Combat> {
    if (!combat) throw combatErrors.notFound()
    const character = await characters.findById(combat.snapshot.characterId)
    if (!character?.isOwnedBy(accountId)) throw combatErrors.notFound()
    return combat
}
