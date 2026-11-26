import type { GameEventEntry } from '../../domain/game-event-entry'

export interface JournalRepository {
    append(entry: GameEventEntry): Promise<void>
    /** Entrées d'un personnage, dans l'ordre d'écriture. */
    findByCharacter(characterId: string): Promise<GameEventEntry[]>
    /** Entrées d'un combat, dans l'ordre d'écriture (base de l'historique, PROD-01). */
    findByCombat(combatId: string): Promise<GameEventEntry[]>
}
