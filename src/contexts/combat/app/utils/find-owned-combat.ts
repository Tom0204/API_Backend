import type { Combat } from '../../domain/combat'
import { combatErrors } from '../../domain/combat-errors'
import type { CombatFighters } from '../interfaces/combat-fighters'

/** Le combat appartient au propriétaire de son personnage ; celui d'un autre joueur = inexistant. */
export async function ensureCombatOwnedBy(
    combat: Combat | undefined,
    fighters: Pick<CombatFighters, 'isOwnedBy'>,
    accountId: string
): Promise<Combat> {
    if (!combat) throw combatErrors.notFound()
    if (!(await fighters.isOwnedBy(combat.snapshot.characterId, accountId))) throw combatErrors.notFound()
    return combat
}
