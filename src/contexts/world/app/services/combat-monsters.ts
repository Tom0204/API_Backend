import type { WorldRepository } from '../interfaces/world-repository'

/**
 * Ce que world offre au combat : un monstre, sa zone et ses statistiques. Aucun import du contexte combat
 * (typage structurel, vérifié à l'assemblage dans `platform/transaction.ts`).
 */
export function createCombatMonsters({ world }: { world: WorldRepository }) {
    return {
        async findById(id: string) {
            const monster = await world.findMonsterById(id)
            if (!monster) return undefined
            const { name, zoneId, hp, attack, defense, speed } = monster.snapshot
            return { id: monster.id, name, zoneId, stats: { maxHp: hp, attack, defense, speed } }
        }
    }
}
