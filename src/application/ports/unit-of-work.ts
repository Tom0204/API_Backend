import type { CharacterClassRepository } from '../../domain/characters/character-class-repository'
import type { CharacterRepository } from '../../domain/characters/character-repository'
import type { CombatRepository } from '../../domain/combat/combat-repository'
import type { AccountRepository } from '../../domain/identity/account-repository'
import type { InventoryRepository } from '../../domain/inventory/inventory-repository'
import type { SessionRepository } from '../../domain/identity/session-repository'
import type { WorldRepository } from '../../domain/world/world-repository'

/** Repositories disponibles dans une transaction ; chaque lot ajoute ceux de ses agrégats. */
export interface Repositories {
    accounts: AccountRepository
    sessions: SessionRepository
    characters: CharacterRepository
    classes: CharacterClassRepository
    world: WorldRepository
    combats: CombatRepository
    inventories: InventoryRepository
}

/** Exécute `work` dans une transaction : tout est validé, ou tout est annulé si une erreur est levée. */
export interface UnitOfWork {
    run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>
}
