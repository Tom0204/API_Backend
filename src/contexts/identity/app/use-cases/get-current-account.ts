import type { AuthContext } from '../../../../shared/app/auth-context'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { identityErrors } from '../../domain/identity-errors'
import type { AccountRepository } from '../interfaces/account-repository'
import { type AccountOutput, toAccountOutput } from '../utils/account-output'

type Transaction = { accounts: AccountRepository }

export function createGetCurrentAccount({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: async ({ accountId }: AuthContext): Promise<AccountOutput> => {
            const account = await unitOfWork.run(({ accounts }) => accounts.findById(accountId))
            // Session valide sans compte : impossible tant que les sessions sont supprimées avec leur compte.
            if (!account) throw identityErrors.unauthenticated()
            return toAccountOutput(account)
        }
    }
}

export type GetCurrentAccount = ReturnType<typeof createGetCurrentAccount>
