import type { Account } from '../../domain/identity/account'
import { identityErrors } from '../../domain/identity/identity-errors'
import type { UnitOfWork } from '../ports/unit-of-work'
import type { AuthContext } from './authenticate'

export function createGetCurrentAccount({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        execute: async ({ accountId }: AuthContext): Promise<Account> => {
            const account = await unitOfWork.run(({ accounts }) => accounts.findById(accountId))
            // Session valide sans compte : impossible tant que les sessions sont supprimées avec leur compte.
            if (!account) throw identityErrors.unauthenticated()
            return account
        }
    }
}

export type GetCurrentAccount = ReturnType<typeof createGetCurrentAccount>
