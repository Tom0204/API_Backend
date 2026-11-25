import { randomUUID } from 'node:crypto'
import type { Repositories, UnitOfWork } from '../../src/application/ports/unit-of-work'
import { Account } from '../../src/domain/identity/account'
import type { AccountRepository } from '../../src/domain/identity/account-repository'
import { Email } from '../../src/domain/identity/email'
import { identityErrors } from '../../src/domain/identity/identity-errors'
import { Session } from '../../src/domain/identity/session'
import type { SessionRepository } from '../../src/domain/identity/session-repository'

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

export interface InMemoryState {
    accounts: AccountRecord[]
    sessions: SessionRecord[]
}

/**
 * Base en mémoire avec les garanties du `UnitOfWork` Prisma :
 * - `work` s'exécute sur une copie de l'état, conservée seulement s'il réussit (annulation) ;
 * - les unités de travail s'exécutent l'une après l'autre (équivalent des verrous et des index uniques).
 */
export class InMemoryDatabase implements UnitOfWork {
    state: InMemoryState = { accounts: [], sessions: [] }
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
}

function createRepositories(draft: InMemoryState): Repositories {
    return { accounts: createAccountRepository(draft), sessions: createSessionRepository(draft) }
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

function toAccount(record: AccountRecord | undefined): Account | undefined {
    return record ? Account.restore({ ...record, email: Email.create(record.email) }) : undefined
}
