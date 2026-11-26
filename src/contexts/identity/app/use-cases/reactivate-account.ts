import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { AccountRepository } from '../interfaces/account-repository'
import { type AdminAccountOutput, toAdminAccountOutput } from '../utils/admin-account-output'
import { type AdministrationInput, findAdministrableAccount } from '../utils/find-administrable-account'

type Transaction = { accounts: AccountRepository }

/** Réactivation (ROLE-03, L7 D4) : idempotente ; les sessions révoquées le restent, le joueur se reconnecte. */
export function createReactivateAccount({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: (input: AdministrationInput): Promise<AdminAccountOutput> =>
            unitOfWork.run(async ({ accounts }) => {
                const { actor, target } = await findAdministrableAccount(accounts, input)
                target.reactivate(actor)
                await accounts.save(target)
                return toAdminAccountOutput(target)
            })
    }
}

export type ReactivateAccount = ReturnType<typeof createReactivateAccount>
