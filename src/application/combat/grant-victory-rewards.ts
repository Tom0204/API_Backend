import type { Progression } from '../../domain/characters/progression'
import type { Combat } from '../../domain/combat/combat'
import type { ItemStack } from '../../domain/inventory/item-stack'
import { LOOT_QUANTITY } from '../../domain/shared/game-rules'
import type { RandomSource } from '../ports/random-source'
import type { Repositories } from '../ports/unit-of-work'

/** Récompenses d'une victoire (L4 D2) : non persistées, renvoyées par l'action finale seulement. */
export interface VictoryRewards {
    /** XP fixe du monstre (rules.md §7) ; au niveau 10, elle est ignorée par la progression (rules.md §5). */
    experienceGained: number
    levelsGained: number
    progression: Progression
    item: ItemStack | null
}

/**
 * Victoire (rules.md §7) : XP du monstre et butin éventuel, dans la transaction de l'action finale.
 * Appelée une seule fois : la transition `IN_PROGRESS → VICTORY` a lieu sous le verrou du combat,
 * toute action suivante lève `COMBAT_FINISHED` et annule sa transaction.
 */
export async function grantVictoryRewards(
    combat: Combat,
    { characters, world, inventories }: Repositories,
    random: RandomSource
): Promise<VictoryRewards> {
    const { characterId, monsterTemplateId } = combat.snapshot
    // Verrou sur le personnage, toujours pris après celui du combat : aucun gain d'XP perdu (rules.md §5).
    const character = await characters.findByIdForUpdate(characterId)
    if (!character) throw new Error(`Personnage introuvable pour le combat ${combat.id}`) // clé étrangère → 500
    const monster = await world.findMonsterById(monsterTemplateId)
    if (!monster) throw new Error(`Monstre introuvable pour le combat ${combat.id}`)

    const experienceGained = monster.snapshot.xpReward
    const levelsGained = character.gainExperience(experienceGained)
    await characters.save(character)

    const lootItem = monster.rollLoot(random.next())
    let item: ItemStack | null = null
    if (lootItem) {
        const inventory = await inventories.findByCharacter(characterId)
        item = inventory.add(lootItem, LOOT_QUANTITY)
        await inventories.save(inventory)
    }

    return { experienceGained, levelsGained, progression: character.snapshot.progression, item }
}
