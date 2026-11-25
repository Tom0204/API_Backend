import type { Combat, NewCombat } from './combat'

export interface CombatRepository {
    findById(id: string): Promise<Combat | undefined>
    /** Dans une transaction : verrouille le combat jusqu'à la fin de la transaction. */
    findByIdForUpdate(id: string): Promise<Combat | undefined>
    hasInProgressForCharacter(characterId: string): Promise<boolean>
    /** Lève `CHARACTER_ALREADY_IN_COMBAT` si le personnage a déjà un combat `IN_PROGRESS`. */
    insert(combat: NewCombat): Promise<Combat>
    /** Enregistre PV, statut et date de fin ; les statistiques figées ne changent jamais. */
    save(combat: Combat): Promise<void>
}
