import type { CombatantStats } from '../../domain/combatant'

/** Personnage vu par le combat : jamais l'agrégat du contexte characters. */
export interface Fighter {
    id: string
    zoneId: string
    /** Statistiques à son niveau courant, calculées par characters (rules.md §3). */
    stats: CombatantStats
}

/** Ce que le combat attend des personnages ; fourni par le contexte characters. */
export interface CombatFighters {
    /** Verrouille le personnage jusqu'à la fin de la transaction ; `undefined` s'il n'existe pas ou n'est pas au compte. */
    lockOwned(characterId: string, accountId: string): Promise<Fighter | undefined>
    isOwnedBy(characterId: string, accountId: string): Promise<boolean>
}
