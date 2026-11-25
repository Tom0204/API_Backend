import type { CombatTurnView } from '../../../application/combat/start-combat'
import type { Combatant } from '../../../domain/combat/combatant'

/** Liste blanche (L3 D2) : état des deux participants et dégâts de la requête. */
export function presentCombat({ combat, lastTurn }: CombatTurnView) {
    const { id, characterId, monsterTemplateId, monsterName, status, character, monster, createdAt, finishedAt } =
        combat.snapshot
    return {
        id,
        characterId,
        monsterId: monsterTemplateId,
        status,
        character: presentCombatant(character),
        monster: { name: monsterName, ...presentCombatant(monster) },
        lastTurn: lastTurn ? { characterDamage: lastTurn.characterDamage, monsterDamage: lastTurn.monsterDamage } : null,
        createdAt: createdAt.toISOString(),
        finishedAt: finishedAt ? finishedAt.toISOString() : null
    }
}

function presentCombatant(combatant: Combatant) {
    const { maxHp, attack, defense, speed } = combatant.stats
    return { hp: combatant.hp, maxHp, attack, defense, speed }
}
