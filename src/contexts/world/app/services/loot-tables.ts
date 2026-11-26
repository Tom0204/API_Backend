import type { WorldRepository } from '../interfaces/world-repository'

/** Ce que world offre à inventory : la règle de butin d'un monstre (rules.md §7). Typage structurel. */
export function createLootTables({ world }: { world: WorldRepository }) {
    return {
        async roll(monsterId: string, r: number) {
            const monster = await world.findMonsterById(monsterId)
            if (!monster) throw new Error(`Monstre introuvable : ${monsterId}`) // clé étrangère → 500
            return monster.rollLoot(r)
        }
    }
}
