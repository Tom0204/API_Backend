import type { Combat, CombatStatus, TurnResult } from '../../domain/combat'
import type { Combatant } from '../../domain/combatant'
import type { LootedItem } from '../interfaces/combat-loot'

export interface CombatantOutput {
    hp: number
    maxHp: number
    attack: number
    defense: number
    speed: number
}

export interface CombatOutput {
    id: string
    characterId: string
    monsterId: string
    monsterName: string
    status: CombatStatus
    character: CombatantOutput
    monster: CombatantOutput
    createdAt: Date
    finishedAt: Date | null
}

/** Dégâts de la requête ; `null` pour un participant qui n'a pas joué. */
export interface TurnOutput {
    characterDamage: number | null
    monsterDamage: number | null
}

/** Récompenses d'une victoire (L4 D2) : non persistées, renvoyées par l'action finale seulement. */
export interface RewardsOutput {
    /** XP fixe du monstre (rules.md §7) ; au niveau 10, elle est ignorée par la progression (rules.md §5). */
    experienceGained: number
    levelsGained: number
    level: number
    experience: number
    item: LootedItem | null
}

/** Réponse commune au démarrage, à l'action et à la consultation (L3 D2, L4 D2). */
export interface CombatView {
    combat: CombatOutput
    /** `null` si personne n'a joué pendant la requête. */
    lastTurn: TurnOutput | null
    /** `null` hors de l'action finale victorieuse. */
    rewards: RewardsOutput | null
}

export function toCombatView(combat: Combat, lastTurn: TurnResult | null, rewards: RewardsOutput | null): CombatView {
    const { id, characterId, monsterTemplateId, monsterName, status, character, monster, createdAt, finishedAt } =
        combat.snapshot
    return {
        combat: {
            id,
            characterId,
            monsterId: monsterTemplateId,
            monsterName,
            status,
            character: toCombatantOutput(character),
            monster: toCombatantOutput(monster),
            createdAt,
            finishedAt
        },
        lastTurn: lastTurn ? { characterDamage: lastTurn.characterDamage, monsterDamage: lastTurn.monsterDamage } : null,
        rewards
    }
}

function toCombatantOutput(combatant: Combatant): CombatantOutput {
    const { maxHp, attack, defense, speed } = combatant.stats
    return { hp: combatant.hp, maxHp, attack, defense, speed }
}
