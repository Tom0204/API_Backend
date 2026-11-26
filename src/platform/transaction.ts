import type { CharacterClassRepository } from '../contexts/characters/app/interfaces/character-class-repository'
import type { CharacterRepository } from '../contexts/characters/app/interfaces/character-repository'
import { createCharacterOwners } from '../contexts/characters/app/services/character-owners'
import { createCombatFighters } from '../contexts/characters/app/services/combat-fighters'
import type { CombatFighters } from '../contexts/combat/app/interfaces/combat-fighters'
import type { CombatLoot } from '../contexts/combat/app/interfaces/combat-loot'
import type { CombatMonsters } from '../contexts/combat/app/interfaces/combat-monsters'
import type { CombatRepository } from '../contexts/combat/app/interfaces/combat-repository'
import type { AccountRepository } from '../contexts/identity/app/interfaces/account-repository'
import type { SessionRepository } from '../contexts/identity/app/interfaces/session-repository'
import type { CharacterOwners } from '../contexts/inventory/app/interfaces/character-owners'
import type { InventoryRepository } from '../contexts/inventory/app/interfaces/inventory-repository'
import { createCombatLoot } from '../contexts/inventory/app/services/combat-loot'
import type { WorldRepository } from '../contexts/world/app/interfaces/world-repository'
import { createCombatMonsters } from '../contexts/world/app/services/combat-monsters'

/** Repositories de tous les contextes, ouverts sur une même transaction. */
export interface AppRepositories {
    accounts: AccountRepository
    sessions: SessionRepository
    characters: CharacterRepository
    classes: CharacterClassRepository
    world: WorldRepository
    combats: CombatRepository
    inventories: InventoryRepository
}

/** Transaction complète : satisfait le type `Transaction` déclaré par chaque cas d'usage. */
export interface AppTransaction extends AppRepositories {
    fighters: CombatFighters
    monsters: CombatMonsters
    loot: CombatLoot
    characterOwners: CharacterOwners
}

/**
 * Seul endroit qui relie les contextes : chaque service est construit sur les repositories de la même
 * transaction, et son type est vérifié ici contre le contrat déclaré par le contexte qui l'utilise.
 */
export function withContextServices(repositories: AppRepositories): AppTransaction {
    const fighters: CombatFighters = createCombatFighters(repositories)
    const monsters: CombatMonsters = createCombatMonsters(repositories)
    const loot: CombatLoot = createCombatLoot(repositories)
    const characterOwners: CharacterOwners = createCharacterOwners(repositories)
    return { ...repositories, fighters, monsters, loot, characterOwners }
}
