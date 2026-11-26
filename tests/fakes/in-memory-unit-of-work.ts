import { randomUUID } from 'node:crypto'
import { type AppRepositories, type AppTransaction, withContextServices } from '../../src/platform/transaction'
import { createEventHandlers } from '../../src/platform/events/event-handlers'
import type { EventHandler } from '../../src/shared/app/event-publisher'
import type { JournalRepository } from '../../src/contexts/journal/app/interfaces/journal-repository'
import type { GameEventEntry } from '../../src/contexts/journal/domain/game-event-entry'
import { FixedRandom } from './fake-ports'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'
import { Character } from '../../src/contexts/characters/domain/character'
import { CharacterClass } from '../../src/contexts/characters/domain/character-class'
import type { CharacterClassRepository } from '../../src/contexts/characters/app/interfaces/character-class-repository'
import { characterErrors } from '../../src/contexts/characters/domain/character-errors'
import { CharacterName } from '../../src/contexts/characters/domain/character-name'
import type { CharacterRepository } from '../../src/contexts/characters/app/interfaces/character-repository'
import { Progression } from '../../src/contexts/characters/domain/progression'
import type { StatBlock } from '../../src/contexts/characters/domain/stats'
import { Account } from '../../src/contexts/identity/domain/account'
import type { AccountRepository } from '../../src/contexts/identity/app/interfaces/account-repository'
import { Email } from '../../src/contexts/identity/domain/email'
import { identityErrors } from '../../src/contexts/identity/domain/identity-errors'
import { RefreshToken } from '../../src/contexts/identity/domain/refresh-token'
import { Session } from '../../src/contexts/identity/domain/session'
import type { SessionRepository } from '../../src/contexts/identity/app/interfaces/session-repository'
import { Inventory } from '../../src/contexts/inventory/domain/inventory'
import type { InventoryRepository } from '../../src/contexts/inventory/app/interfaces/inventory-repository'
import { ItemStack } from '../../src/contexts/inventory/domain/item-stack'
import { Combat, type CombatStatus } from '../../src/contexts/combat/domain/combat'
import { combatErrors } from '../../src/contexts/combat/domain/combat-errors'
import type { CombatRepository } from '../../src/contexts/combat/app/interfaces/combat-repository'
import { Combatant, type CombatantStats } from '../../src/contexts/combat/domain/combatant'
import { STARTING_ZONE_CODE } from '../../src/shared/domain/game-rules'
import { MonsterTemplate, type MonsterTemplateProps } from '../../src/contexts/world/domain/monster-template'
import type { WorldRepository } from '../../src/contexts/world/app/interfaces/world-repository'
import { Zone, type ZoneProps } from '../../src/contexts/world/domain/zone'
import { CHARACTER_CLASSES, ITEMS, MONSTER_TEMPLATES, ZONES } from '../../src/platform/prisma/seed-reference-data'

interface AccountRecord {
    id: string
    email: string
    passwordHash: string
    failedLoginCount: number
    lockedUntil: Date | null
    createdAt: Date
}

interface SessionRecord {
    id: string
    accountId: string
    accessTokenHash: string
    accessExpiresAt: Date
    expiresAt: Date
    revokedAt: Date | null
}

interface RefreshTokenRecord {
    id: string
    sessionId: string
    tokenHash: string
    usedAt: Date | null
}

interface CharacterClassRecord {
    id: string
    code: string
    name: string
    base: StatBlock
    perLevel: StatBlock
}

interface CharacterRecord {
    id: string
    accountId: string
    classId: string
    zoneId: string
    name: string
    level: number
    experience: number
    createdAt: Date
}

type MonsterRecord = MonsterTemplateProps

interface ItemRecord {
    id: string
    code: string
    name: string
}

interface InventoryItemRecord {
    characterId: string
    itemId: string
    quantity: number
}

interface CombatRecord {
    id: string
    characterId: string
    monsterTemplateId: string
    status: CombatStatus
    character: { stats: CombatantStats; hp: number }
    monster: { stats: CombatantStats; hp: number }
    createdAt: Date
    finishedAt: Date | null
}

export interface InMemoryState {
    accounts: AccountRecord[]
    sessions: SessionRecord[]
    refreshTokens: RefreshTokenRecord[]
    classes: CharacterClassRecord[]
    characters: CharacterRecord[]
    zones: ZoneProps[]
    items: ItemRecord[]
    monsters: MonsterRecord[]
    combats: CombatRecord[]
    inventoryItems: InventoryItemRecord[]
    gameEvents: (GameEventEntry & { seq: number })[]
}

/** Zone de départ des tests sans base (équivalent de la Clairière du seed). */
export const IN_MEMORY_STARTING_ZONE_ID = '0197f2a0-0000-7000-8000-00000000c1ea'

function seedZones(): ZoneProps[] {
    return ZONES.map((zone) => ({
        ...zone,
        id: zone.code === STARTING_ZONE_CODE ? IN_MEMORY_STARTING_ZONE_ID : randomUUID()
    }))
}

function seedMonsters(zones: ZoneProps[], items: ItemRecord[]): MonsterRecord[] {
    return MONSTER_TEMPLATES.map(({ zoneCode, loot, ...monster }) => {
        const zone = zones.find((candidate) => candidate.code === zoneCode)
        const item = items.find((candidate) => candidate.code === loot.itemCode)
        if (!zone || !item) throw new Error(`Donnée de référence inconnue : ${monster.code}`)
        return { ...monster, id: randomUUID(), zoneId: zone.id, loot: { item: { ...item }, chance: loot.chance } }
    })
}

/**
 * Base en mémoire avec les garanties du `UnitOfWork` Prisma :
 * - `work` s'exécute sur une copie de l'état, conservée seulement s'il réussit (annulation) ;
 * - les unités de travail s'exécutent l'une après l'autre (équivalent des verrous et des index uniques).
 * Les classes sont celles du seed (mêmes valeurs, identifiants propres à chaque instance).
 */
export class InMemoryDatabase implements UnitOfWork<AppTransaction> {
    state: InMemoryState = {
        accounts: [],
        sessions: [],
        refreshTokens: [],
        classes: CHARACTER_CLASSES.map((characterClass) => ({
            id: randomUUID(),
            code: characterClass.code,
            name: characterClass.name,
            base: { ...characterClass.base },
            perLevel: { ...characterClass.perLevel }
        })),
        characters: [],
        zones: [],
        items: ITEMS.map((item) => ({ id: randomUUID(), code: item.code, name: item.name })),
        monsters: [],
        combats: [],
        inventoryItems: [],
        gameEvents: []
    }
    private queue: Promise<unknown> = Promise.resolve()

    run<T>(work: (transaction: AppTransaction) => Promise<T>): Promise<T> {
        const next = this.queue.then(async () => {
            const draft = structuredClone(this.state)
            const result = await work(withContextServices(createRepositories(draft), this.handlers))
            this.state = draft
            return result
        })
        this.queue = next.catch(() => undefined)
        return next
    }

    /** Source aléatoire du handler de butin : fixée par les tests (0,9 par défaut : aucun butin). */
    readonly random: FixedRandom
    readonly handlers: readonly EventHandler<AppTransaction>[]

    constructor({
        random = new FixedRandom(),
        handlers
    }: { random?: FixedRandom; handlers?: readonly EventHandler<AppTransaction>[] } = {}) {
        this.random = random
        this.handlers = handlers ?? createEventHandlers({ random })
        this.state.zones = seedZones()
        this.state.monsters = seedMonsters(this.state.zones, this.state.items)
    }

    /** Identifiant d'un monstre du seed, par son code (`wolf`, `boar`, `bandit`). */
    monsterId(code: string): string {
        const found = this.state.monsters.find((monster) => monster.code === code)
        if (!found) throw new Error(`Monstre inconnu : ${code}`)
        return found.id
    }

    /** Objet du seed, par son code (`wolf-pelt`, `boar-tusk`, `bandit-badge`). */
    item(code: string): ItemRecord {
        const found = this.state.items.find((item) => item.code === code)
        if (!found) throw new Error(`Objet inconnu : ${code}`)
        return { ...found }
    }

    /** Identifiant d'une classe du seed, par son code (`warrior`, `mage`, `rogue`). */
    classId(code: string): string {
        const found = this.state.classes.find((characterClass) => characterClass.code === code)
        if (!found) throw new Error(`Classe inconnue : ${code}`)
        return found.id
    }
}

function createRepositories(draft: InMemoryState): AppRepositories {
    return {
        accounts: createAccountRepository(draft),
        sessions: createSessionRepository(draft),
        characters: createCharacterRepository(draft),
        classes: createCharacterClassRepository(draft),
        world: createWorldRepository(draft),
        combats: createCombatRepository(draft),
        inventories: createInventoryRepository(draft),
        journal: createJournalRepository(draft)
    }
}

function createWorldRepository(draft: InMemoryState): WorldRepository {
    return {
        findZoneById: async (id) => {
            const zone = draft.zones.find((record) => record.id === id)
            return zone ? Zone.restore({ ...zone }) : undefined
        },
        findMonstersByZone: async (zoneId) =>
            draft.monsters
                .filter((record) => record.zoneId === zoneId)
                .sort((a, b) => a.level - b.level)
                .map((record) => MonsterTemplate.restore(structuredClone(record))),
        findMonsterById: async (id) => {
            const monster = draft.monsters.find((record) => record.id === id)
            return monster ? MonsterTemplate.restore(structuredClone(monster)) : undefined
        }
    }
}

function createCombatRepository(draft: InMemoryState): CombatRepository {
    const restore = (record: CombatRecord): Combat => {
        const monster = draft.monsters.find((candidate) => candidate.id === record.monsterTemplateId)
        if (!monster) throw new Error('Clé étrangère violée : monstre inexistant')
        return Combat.restore({
            id: record.id,
            characterId: record.characterId,
            monsterTemplateId: record.monsterTemplateId,
            monsterName: monster.name,
            status: record.status,
            character: Combatant.of({ ...record.character.stats }, record.character.hp),
            monster: Combatant.of({ ...record.monster.stats }, record.monster.hp),
            createdAt: record.createdAt,
            finishedAt: record.finishedAt
        })
    }
    const findRecord = (id: string) => draft.combats.find((record) => record.id === id)

    return {
        findById: async (id) => {
            const record = findRecord(id)
            return record ? restore(record) : undefined
        },
        // Les unités de travail sont déjà exécutées l'une après l'autre : équivalent du verrou sur le combat.
        findByIdForUpdate: async (id) => {
            const record = findRecord(id)
            return record ? restore(record) : undefined
        },
        hasInProgressForCharacter: async (characterId) =>
            draft.combats.some((record) => record.characterId === characterId && record.status === 'IN_PROGRESS'),
        insert: async (combat) => {
            if (
                combat.status === 'IN_PROGRESS' &&
                draft.combats.some((record) => record.characterId === combat.characterId && record.status === 'IN_PROGRESS')
            ) {
                throw combatErrors.alreadyInCombat() // équivalent de l'index unique partiel
            }
            if (!draft.characters.some((record) => record.id === combat.characterId)) {
                throw new Error('Clé étrangère violée : personnage inexistant')
            }
            const record: CombatRecord = {
                id: randomUUID(),
                characterId: combat.characterId,
                monsterTemplateId: combat.monsterTemplateId,
                status: combat.status,
                character: { stats: { ...combat.character.stats }, hp: combat.character.hp },
                monster: { stats: { ...combat.monster.stats }, hp: combat.monster.hp },
                createdAt: new Date(),
                finishedAt: combat.finishedAt
            }
            draft.combats.push(record)
            return restore(record)
        },
        save: async (combat) => {
            const { id, status, character, monster, finishedAt } = combat.snapshot
            const record = findRecord(id)
            if (!record) throw new Error('Combat inexistant')
            Object.assign(record, {
                status,
                finishedAt,
                character: { ...record.character, hp: character.hp },
                monster: { ...record.monster, hp: monster.hp }
            })
        }
    }
}

function createJournalRepository(draft: InMemoryState): JournalRepository {
    const read = (keep: (entry: GameEventEntry) => boolean) =>
        draft.gameEvents
            .filter(keep)
            .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.seq - b.seq)
            .map(({ seq: _seq, ...entry }) => structuredClone(entry))
    return {
        append: async (entry) => {
            if (!draft.characters.some((record) => record.id === entry.characterId)) {
                throw new Error('Clé étrangère violée : personnage inexistant')
            }
            if (entry.combatId !== null && !draft.combats.some((record) => record.id === entry.combatId)) {
                throw new Error('Clé étrangère violée : combat inexistant')
            }
            if (entry.type.trim() === '') throw new Error('Contrainte CHECK violée : type vide') // game_events_type_not_blank
            draft.gameEvents.push({ ...structuredClone(entry), seq: draft.gameEvents.length })
        },
        findByCharacter: async (characterId) => read((entry) => entry.characterId === characterId),
        findByCombat: async (combatId) => read((entry) => entry.combatId === combatId)
    }
}

function createInventoryRepository(draft: InMemoryState): InventoryRepository {
    return {
        findByCharacter: async (characterId) =>
            Inventory.restore(
                characterId,
                draft.inventoryItems
                    .filter((record) => record.characterId === characterId)
                    .map((record) => {
                        const item = draft.items.find((candidate) => candidate.id === record.itemId)
                        if (!item) throw new Error('Clé étrangère violée : objet inexistant')
                        return ItemStack.of({ ...item }, record.quantity)
                    })
            ),
        // Équivalent de INSERT … ON CONFLICT DO UPDATE SET quantity = quantity + EXCLUDED.quantity (L4 D1).
        save: async (inventory) => {
            if (!draft.characters.some((record) => record.id === inventory.characterId)) {
                throw new Error('Clé étrangère violée : personnage inexistant')
            }
            for (const added of inventory.pendingAdditions) {
                if (!draft.items.some((item) => item.id === added.item.id)) {
                    throw new Error('Clé étrangère violée : objet inexistant')
                }
                const record = draft.inventoryItems.find(
                    (candidate) => candidate.characterId === inventory.characterId && candidate.itemId === added.item.id
                )
                if (record) record.quantity += added.quantity
                else draft.inventoryItems.push({ characterId: inventory.characterId, itemId: added.item.id, quantity: added.quantity })
            }
        }
    }
}

function createAccountRepository(draft: InMemoryState): AccountRepository {
    return {
        findById: async (id) => toAccount(draft.accounts.find((record) => record.id === id)),
        // Les unités de travail sont déjà exécutées l'une après l'autre : équivalent du verrou sur le compte.
        findByIdForUpdate: async (id) => toAccount(draft.accounts.find((record) => record.id === id)),
        findByEmail: async (email) => toAccount(draft.accounts.find((record) => record.email === email.value)),
        insert: async (account) => {
            if (draft.accounts.some((record) => record.email === account.email.value)) {
                throw identityErrors.emailAlreadyUsed() // équivalent de l'index unique
            }
            const record = {
                id: randomUUID(),
                email: account.email.value,
                passwordHash: account.passwordHash,
                failedLoginCount: 0,
                lockedUntil: null,
                createdAt: new Date()
            }
            draft.accounts.push(record)
            return Account.restore({ ...record, email: Email.create(record.email) })
        },
        save: async (account) => {
            const { id, failedLoginCount, lockedUntil } = account.snapshot
            const record = draft.accounts.find((candidate) => candidate.id === id)
            if (!record) throw new Error('Compte inexistant')
            if (failedLoginCount < 0) throw new Error('Contrainte CHECK violée : compteur négatif')
            Object.assign(record, { failedLoginCount, lockedUntil })
        }
    }
}

function createSessionRepository(draft: InMemoryState): SessionRepository {
    const findRecord = (id: string) => draft.sessions.find((session) => session.id === id)
    const restore = (record: SessionRecord) => Session.restore({ ...record })
    const assertUnique = (field: 'accessTokenHash', value: string, exceptId?: string) => {
        if (draft.sessions.some((session) => session[field] === value && session.id !== exceptId)) {
            throw new Error('Index unique violé : empreinte du jeton d’accès')
        }
    }
    const addRefreshToken = (sessionId: string, tokenHash: string) => {
        if (draft.refreshTokens.some((token) => token.tokenHash === tokenHash)) {
            throw new Error('Index unique violé : empreinte du jeton de rafraîchissement')
        }
        draft.refreshTokens.push({ id: randomUUID(), sessionId, tokenHash, usedAt: null })
    }

    return {
        findByAccessTokenHash: async (accessTokenHash) => {
            const record = draft.sessions.find((session) => session.accessTokenHash === accessTokenHash)
            return record ? restore(record) : undefined
        },
        // Les unités de travail sont déjà exécutées l'une après l'autre : équivalent des verrous.
        findByIdForUpdate: async (id) => {
            const record = findRecord(id)
            return record ? restore(record) : undefined
        },
        findByRefreshTokenHashForUpdate: async (refreshTokenHash) => {
            const token = draft.refreshTokens.find((candidate) => candidate.tokenHash === refreshTokenHash)
            const session = token && findRecord(token.sessionId)
            if (!token || !session) return undefined
            return { session: restore(session), refreshToken: RefreshToken.restore({ ...token }) }
        },
        insert: async ({ refreshTokenHash, ...session }) => {
            if (!draft.accounts.some((account) => account.id === session.accountId)) {
                throw new Error('Clé étrangère violée : compte inexistant') // équivalent de la contrainte
            }
            if (session.accessExpiresAt.getTime() > session.expiresAt.getTime()) {
                throw new Error('Contrainte CHECK violée : sessions_access_within_family')
            }
            assertUnique('accessTokenHash', session.accessTokenHash)
            const record: SessionRecord = { id: randomUUID(), ...session }
            draft.sessions.push(record)
            addRefreshToken(record.id, refreshTokenHash)
            return restore(record)
        },
        save: async (session) => {
            const { id, accessTokenHash, accessExpiresAt, revokedAt } = session.snapshot
            const { usedRefreshTokenIds, newRefreshTokenHashes, usedAt } = session.changes
            const record = findRecord(id)
            if (!record) throw new Error('Session inexistante')
            if (accessExpiresAt.getTime() > record.expiresAt.getTime()) {
                throw new Error('Contrainte CHECK violée : sessions_access_within_family')
            }
            assertUnique('accessTokenHash', accessTokenHash, id)
            Object.assign(record, { accessTokenHash, accessExpiresAt, revokedAt })
            for (const token of draft.refreshTokens) {
                if (token.sessionId === id && usedRefreshTokenIds.includes(token.id)) token.usedAt = usedAt
            }
            for (const tokenHash of newRefreshTokenHashes) addRefreshToken(id, tokenHash)
        },
        revokeAllByAccount: async (accountId, now) => {
            const active = draft.sessions.filter((session) => session.accountId === accountId && session.revokedAt === null)
            for (const session of active) session.revokedAt = now
            return active.length
        }
    }
}

function createCharacterClassRepository(draft: InMemoryState): CharacterClassRepository {
    return {
        findById: async (id) => toCharacterClass(draft.classes.find((record) => record.id === id)),
        findAll: async () =>
            [...draft.classes]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((record) => CharacterClass.restore(structuredClone(record)))
    }
}

function createCharacterRepository(draft: InMemoryState): CharacterRepository {
    return {
        findById: async (id) => toCharacter(draft.characters.find((record) => record.id === id)),
        // Exécution en série : équivalent du verrou sur le personnage.
        findByIdForUpdate: async (id) => toCharacter(draft.characters.find((record) => record.id === id)),
        findByAccount: async (accountId) =>
            draft.characters
                .filter((record) => record.accountId === accountId)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                .map((record) => restoreCharacter(record)),
        // Les unités de travail sont déjà exécutées l'une après l'autre : équivalent du verrou sur le compte.
        countByAccountForUpdate: async (accountId) =>
            draft.characters.filter((record) => record.accountId === accountId).length,
        isNameTaken: async (normalizedName) =>
            draft.characters.some((record) => record.name.toLowerCase() === normalizedName),
        insert: async (character) => {
            if (draft.characters.some((record) => record.name.toLowerCase() === character.name.normalized)) {
                throw characterErrors.nameTaken() // équivalent de l'index unique lower(name)
            }
            if (!draft.accounts.some((account) => account.id === character.accountId)) {
                throw new Error('Clé étrangère violée : compte inexistant')
            }
            if (!draft.classes.some((record) => record.id === character.classId)) {
                throw new Error('Clé étrangère violée : classe inexistante')
            }
            const record: CharacterRecord = {
                id: randomUUID(),
                accountId: character.accountId,
                classId: character.classId,
                zoneId: character.zoneId,
                name: character.name.value,
                level: character.progression.level,
                experience: character.progression.experience,
                createdAt: new Date()
            }
            draft.characters.push(record)
            return restoreCharacter(record)
        },
        save: async (character) => {
            const { id, progression } = character.snapshot
            const record = draft.characters.find((candidate) => candidate.id === id)
            if (!record) throw new Error('Personnage inexistant')
            Object.assign(record, { level: progression.level, experience: progression.experience })
        }
    }
}

function toAccount(record: AccountRecord | undefined): Account | undefined {
    return record ? Account.restore({ ...record, email: Email.create(record.email) }) : undefined
}

function toCharacterClass(record: CharacterClassRecord | undefined): CharacterClass | undefined {
    return record ? CharacterClass.restore(structuredClone(record)) : undefined
}

function toCharacter(record: CharacterRecord | undefined): Character | undefined {
    return record ? restoreCharacter(record) : undefined
}

function restoreCharacter(record: CharacterRecord): Character {
    return Character.restore({
        id: record.id,
        accountId: record.accountId,
        classId: record.classId,
        zoneId: record.zoneId,
        name: CharacterName.create(record.name),
        progression: Progression.of(record.level, record.experience),
        createdAt: record.createdAt
    })
}
