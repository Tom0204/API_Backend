import type { WorldRepository } from '../interfaces/world-repository'

/**
 * Ce que world offre au combat : un monstre et sa règle de butin. Aucun import du contexte combat
 * (typage structurel, vérifié à l'assemblage dans `platform/transaction.ts`).
 */
export function createCombatMonsters({ world }: { world: WorldRepository }) {
    return {
        async findById(id: string) {
            const monster = await world.findMonsterById(id)
            if (!monster) return undefined
            const { name, zoneId, hp, attack, defense, speed, xpReward } = monster.snapshot
            return {
                id: monster.id,
                name,
                zoneId,
                stats: { maxHp: hp, attack, defense, speed },
                xpReward,
                rollLoot: (r: number) => monster.rollLoot(r)
            }
        }
    }
}
