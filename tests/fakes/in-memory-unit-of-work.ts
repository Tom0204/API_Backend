import { randomUUID } from 'node:crypto'
import type { Repositories, UnitOfWork } from '../../src/application/ports/unit-of-work'
import { Character } from '../../src/domain/characters/character'
import { CharacterClass } from '../../src/domain/characters/character-class'
import type { CharacterClassRepository } from '../../src/domain/characters/character-class-repository'
import { characterErrors } from '../../src/domain/characters/character-errors'
import { CharacterName } from '../../src/domain/characters/character-name'
import type { CharacterRepository } from '../../src/domain/characters/character-repository'
import { Progression } from '../../src/domain/characters/progression'
import type { StatBlock } from '../../src/domain/characters/stats'
import { Account } from '../../src/domain/identity/account'
import type { AccountRepository } from '../../src/domain/identity/account-repository'
import { Email } from '../../src/domain/identity/email'
import { identityErrors } from '../../src/domain/identity/identity-errors'
import { Session } from '../../src/domain/identity/session'
import type { SessionRepository } from '../../src/domain/identity/session-repository'
import { CHARACTER_CLASSES } from '../../src/infrastructure/prisma/seed-reference-data'

interface AccountRecord {
    id: string
    email: string
    passwordHash: string
    createdAt: Date
}

interface SessionRecord {
    id: string
    accountId: string
    tokenHash: string
    expiresAt: Date
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

export interface InMemoryState {
    accounts: AccountRecord[]
    sessions: SessionRecord[]
    classes: CharacterClassRecord[]
    characters: CharacterRecord[]
}

/** Zone de départ des tests sans base (équivalent de la Clairière du seed). */
export const IN_MEMORY_STARTING_ZONE_ID = '0197f2a0-0000-7000-8000-00000000c1ea'

/**
 * Base en mémoire avec les garanties du `UnitOfWork` Prisma :
 * - `work` s'exécute sur une copie de l'état, conservée seulement s'il réussit (annulation) ;
 * - les unités de travail s'exécutent l'une après l'autre (équivalent des verrous et des index uniques).
 * Les classes sont celles du seed (mêmes valeurs, identifiants propres à chaque instance).
 */
export class InMemoryDatabase implements UnitOfWork {
    state: InMemoryState = {
        accounts: [],
        sessions: [],
        classes: CHARACTER_CLASSES.map((characterClass) => ({
            id: randomUUID(),
            code: characterClass.code,
            name: characterClass.name,
            base: { ...characterClass.base },
            perLevel: { ...characterClass.perLevel }
        })),
        characters: []
    }
    private queue: Promise<unknown> = Promise.resolve()

    run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
        const next = this.queue.then(async () => {
            const draft = structuredClone(this.state)
            const result = await work(createRepositories(draft))
            this.state = draft
            return result
        })
        this.queue = next.catch(() => undefined)
        return next
    }

    /** Identifiant d'une classe du seed, par son code (`warrior`, `mage`, `rogue`). */
    classId(code: string): string {
        const found = this.state.classes.find((characterClass) => characterClass.code === code)
        if (!found) throw new Error(`Classe inconnue : ${code}`)
        return found.id
    }
}

function createRepositories(draft: InMemoryState): Repositories {
    return {
        accounts: createAccountRepository(draft),
        sessions: createSessionRepository(draft),
        characters: createCharacterRepository(draft),
        classes: createCharacterClassRepository(draft)
    }
}

function createAccountRepository(draft: InMemoryState): AccountRepository {
    return {
        findById: async (id) => toAccount(draft.accounts.find((record) => record.id === id)),
        findByEmail: async (email) => toAccount(draft.accounts.find((record) => record.email === email.value)),
        insert: async (account) => {
            if (draft.accounts.some((record) => record.email === account.email.value)) {
                throw identityErrors.emailAlreadyUsed() // équivalent de l'index unique
            }
            const record = {
                id: randomUUID(),
                email: account.email.value,
                passwordHash: account.passwordHash,
                createdAt: new Date()
            }
            draft.accounts.push(record)
            return Account.restore({ ...record, email: Email.create(record.email) })
        }
    }
}

function createSessionRepository(draft: InMemoryState): SessionRepository {
    return {
        findByTokenHash: async (tokenHash) => {
            const record = draft.sessions.find((session) => session.tokenHash === tokenHash)
            return record ? Session.restore({ ...record }) : undefined
        },
        insert: async (session) => {
            if (!draft.accounts.some((account) => account.id === session.accountId)) {
                throw new Error('Clé étrangère violée : compte inexistant') // équivalent de la contrainte
            }
            const record = { id: randomUUID(), ...session }
            draft.sessions.push(record)
            return Session.restore({ ...record })
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
