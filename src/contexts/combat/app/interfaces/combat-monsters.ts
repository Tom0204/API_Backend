import type { CombatantStats } from '../../domain/combatant'

/** Monstre vu par le combat : chaque combat en crée sa propre instance (rules.md §6). */
export interface Opponent {
    id: string
    name: string
    zoneId: string
    stats: CombatantStats
}

/** Ce que le combat attend des monstres ; fourni par le contexte world. */
export interface CombatMonsters {
    findById(id: string): Promise<Opponent | undefined>
}
