import type { CharacterClassRepository } from '../contexts/characters/app/interfaces/character-class-repository'
import type { CharacterRepository } from '../contexts/characters/app/interfaces/character-repository'
import type { MonsterExperience } from '../contexts/characters/app/interfaces/monster-experience'
import { createCharacterOwners } from '../contexts/characters/app/services/character-owners'
import { createCombatFighters } from '../contexts/characters/app/services/combat-fighters'
import type { CombatFighters } from '../contexts/combat/app/interfaces/combat-fighters'
import type { CombatMonsters } from '../contexts/combat/app/interfaces/combat-monsters'
import type { CombatRepository } from '../contexts/combat/app/interfaces/combat-repository'
import type { AccountRepository } from '../contexts/identity/app/interfaces/account-repository'
import type { SessionRepository } from '../contexts/identity/app/interfaces/session-repository'
import type { CharacterOwners } from '../contexts/inventory/app/interfaces/character-owners'
import type { InventoryRepository } from '../contexts/inventory/app/interfaces/inventory-repository'
import type { LootTables } from '../contexts/inventory/app/interfaces/loot-tables'
import type { JournalRepository } from '../contexts/journal/app/interfaces/journal-repository'
import type { WorldRepository } from '../contexts/world/app/interfaces/world-repository'
import { createCombatMonsters } from '../contexts/world/app/services/combat-monsters'
import { createLootTables } from '../contexts/world/app/services/loot-tables'
import { createMonsterExperience } from '../contexts/world/app/services/monster-experience'
import type { EventHandler, EventPublisher } from '../shared/app/event-publisher'
import { createEventPublisher } from './events/event-publisher'

/** Repositories de tous les contextes, ouverts sur une même transaction. */
export interface AppRepositories {
    accounts: AccountRepository
    sessions: SessionRepository
    characters: CharacterRepository
    classes: CharacterClassRepository
    world: WorldRepository
    combats: CombatRepository
    inventories: InventoryRepository
    journal: JournalRepository
}

/** Transaction complète : satisfait le type `Transaction` déclaré par chaque cas d'usage et chaque handler. */
export interface AppTransaction extends AppRepositories {
    fighters: CombatFighters
    monsters: CombatMonsters
    characterOwners: CharacterOwners
    monsterExperience: MonsterExperience
    lootTables: LootTables
    events: EventPublisher
}

/**
 * Seul endroit qui relie les contextes : chaque service est construit sur les repositories de la même
 * transaction, et son type est vérifié ici contre le contrat déclaré par le contexte qui l'utilise.
 * Le publieur d'événements exécute les handlers sur cette même transaction.
 */
export function withContextServices(
    repositories: AppRepositories,
    handlers: readonly EventHandler<AppTransaction>[]
): AppTransaction {
    const fighters: CombatFighters = createCombatFighters(repositories)
    const monsters: CombatMonsters = createCombatMonsters(repositories)
    const characterOwners: CharacterOwners = createCharacterOwners(repositories)
    const monsterExperience: MonsterExperience = createMonsterExperience(repositories)
    const lootTables: LootTables = createLootTables(repositories)
    const transaction: AppTransaction = {
        ...repositories,
        fighters,
        monsters,
        characterOwners,
        monsterExperience,
        lootTables,
        events: createEventPublisher(handlers, () => transaction)
    }
    return transaction
}
