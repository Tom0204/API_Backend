import type { WorldRepository } from '../interfaces/world-repository'

/** Ce que world offre à characters : l'XP fixe d'un monstre (rules.md §7, §8). Typage structurel. */
export function createMonsterExperience({ world }: { world: WorldRepository }) {
    return {
        async experienceFor(monsterId: string) {
            return (await world.findMonsterById(monsterId))?.snapshot.xpReward
        }
    }
}
