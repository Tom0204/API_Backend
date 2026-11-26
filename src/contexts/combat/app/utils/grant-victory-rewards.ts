import type { RandomSource } from '../../../../shared/app/random-source'
import { LOOT_QUANTITY } from '../../../../shared/domain/game-rules'
import type { Combat } from '../../domain/combat'
import type { CombatFighters } from '../interfaces/combat-fighters'
import type { CombatLoot } from '../interfaces/combat-loot'
import type { CombatMonsters } from '../interfaces/combat-monsters'
import type { RewardsOutput } from './combat-output'

type Transaction = { fighters: Pick<CombatFighters, 'grantExperience'>; monsters: CombatMonsters; loot: CombatLoot }

/**
 * Victoire (rules.md §7) : XP du monstre et butin éventuel, dans la transaction de l'action finale.
 * Appelée une seule fois : la transition `IN_PROGRESS → VICTORY` a lieu sous le verrou du combat,
 * toute action suivante lève `COMBAT_FINISHED` et annule sa transaction.
 */
export async function grantVictoryRewards(
    combat: Combat,
    { fighters, monsters, loot }: Transaction,
    random: RandomSource
): Promise<RewardsOutput> {
    const { characterId, monsterTemplateId } = combat.snapshot
    const monster = await monsters.findById(monsterTemplateId)
    if (!monster) throw new Error(`Monstre introuvable pour le combat ${combat.id}`) // clé étrangère → 500

    // Verrou sur le personnage, pris après celui du combat (characters applique la progression).
    const { levelsGained, level, experience } = await fighters.grantExperience(characterId, monster.xpReward)
    const lootItem = monster.rollLoot(random.next())
    const item = lootItem ? await loot.give(characterId, lootItem, LOOT_QUANTITY) : null

    return { experienceGained: monster.xpReward, levelsGained, level, experience, item }
}
