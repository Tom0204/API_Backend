import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { AccountRepository } from '../interfaces/account-repository'
import type { SessionRepository } from '../interfaces/session-repository'
import { type AdminAccountOutput, toAdminAccountOutput } from '../utils/admin-account-output'
import { type AdministrationInput, findAdministrableAccount } from '../utils/find-administrable-account'

type Transaction = { accounts: AccountRepository; sessions: SessionRepository }

/**
 * Suspension (ROLE-03, L7 D4) : idempotente ; révoque toutes les sessions du compte dans la même transaction,
 * comme `logout-all` (mise à jour groupée, aucune règle propre à chaque session).
 */
export function createSuspendAccount({ unitOfWork, clock }: { unitOfWork: UnitOfWork<Transaction>; clock: Clock }) {
    return {
        execute: (input: AdministrationInput): Promise<AdminAccountOutput> =>
            unitOfWork.run(async ({ accounts, sessions }) => {
                const { actor, target } = await findAdministrableAccount(accounts, input)
                const now = clock.now()
                target.suspend(actor, now)
                await accounts.save(target)
                await sessions.revokeAllByAccount(target.id, now)
                return toAdminAccountOutput(target)
            })
    }
}

export type SuspendAccount = ReturnType<typeof createSuspendAccount>
