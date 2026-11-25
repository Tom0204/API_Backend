import type { AccountRepository } from '../../domain/identity/account-repository'
import type { SessionRepository } from '../../domain/identity/session-repository'

/** Repositories disponibles dans une transaction ; chaque lot ajoute ceux de ses agrégats. */
export interface Repositories {
    accounts: AccountRepository
    sessions: SessionRepository
}

/** Exécute `work` dans une transaction : tout est validé, ou tout est annulé si une erreur est levée. */
export interface UnitOfWork {
    run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>
}
