import type { CombatHistoryOutput } from '../app/use-cases/get-combat-history'
import type { CombatantOutput, CombatView, RewardsOutput } from '../app/utils/combat-output'

/** Liste blanche (L3 D2, L4 D2) : état des deux participants, dégâts et récompenses de la requête. */
export function presentCombat({ combat, lastTurn, rewards }: CombatView) {
    const { id, characterId, monsterId, monsterName, status, character, monster, createdAt, finishedAt } = combat
    return {
        id,
        characterId,
        monsterId,
        status,
        character: presentCombatant(character),
        monster: { name: monsterName, ...presentCombatant(monster) },
        lastTurn: lastTurn ? { characterDamage: lastTurn.characterDamage, monsterDamage: lastTurn.monsterDamage } : null,
        rewards: rewards ? presentRewards(rewards) : null,
        createdAt: createdAt.toISOString(),
        finishedAt: finishedAt ? finishedAt.toISOString() : null
    }
}

function presentCombatant({ hp, maxHp, attack, defense, speed }: CombatantOutput) {
    return { hp, maxHp, attack, defense, speed }
}

function presentRewards({ experienceGained, levelsGained, level, experience, item }: RewardsOutput) {
    return {
        experienceGained,
        levelsGained,
        level,
        experience,
        item: item ? { id: item.id, code: item.code, name: item.name, quantity: item.quantity } : null
    }
}

/** Liste blanche (L8 D2) : les coups dans l'ordre, PV restants après chaque coup. */
export function presentCombatHistory({ combatId, status, turns }: CombatHistoryOutput) {
    return {
        combatId,
        status,
        turns: turns.map(({ number, attacker, damage, characterHp, monsterHp }) => ({
            number,
            attacker,
            damage,
            characterHp,
            monsterHp
        }))
    }
}
