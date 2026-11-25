import type { VictoryRewards } from '../../../application/combat/grant-victory-rewards'
import type { CombatTurnView } from '../../../application/combat/start-combat'
import type { Combatant } from '../../../domain/combat/combatant'

/** Liste blanche (L3 D2, L4 D2) : état des deux participants, dégâts et récompenses de la requête. */
export function presentCombat({ combat, lastTurn, rewards }: CombatTurnView) {
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
        rewards: rewards ? presentRewards(rewards) : null,
        createdAt: createdAt.toISOString(),
        finishedAt: finishedAt ? finishedAt.toISOString() : null
    }
}

function presentCombatant(combatant: Combatant) {
    const { maxHp, attack, defense, speed } = combatant.stats
    return { hp: combatant.hp, maxHp, attack, defense, speed }
}

function presentRewards({ experienceGained, levelsGained, progression, item }: VictoryRewards) {
    return {
        experienceGained,
        levelsGained,
        level: progression.level,
        experience: progression.experience,
        item: item ? { id: item.item.id, code: item.item.code, name: item.item.name, quantity: item.quantity } : null
    }
}
