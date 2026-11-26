import type { CombatantStats } from '../../domain/combatant'

/** Objet de référence qu'un monstre peut laisser. */
export interface LootItem {
    id: string
    code: string
    name: string
}

/** Monstre vu par le combat : chaque combat en crée sa propre instance (rules.md §6). */
export interface Opponent {
    id: string
    name: string
    zoneId: string
    stats: CombatantStats
    /** XP fixe attribuée à la victoire (rules.md §7). */
    xpReward: number
    /** Butin pour un tirage r dans [0, 1[ ; règle du contexte world (rules.md §7). */
    rollLoot(r: number): LootItem | null
}

/** Ce que le combat attend des monstres ; fourni par le contexte world. */
export interface CombatMonsters {
    findById(id: string): Promise<Opponent | undefined>
}
