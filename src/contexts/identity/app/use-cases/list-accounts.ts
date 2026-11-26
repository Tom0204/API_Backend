import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { AccountRepository } from '../interfaces/account-repository'
import { type AdminAccountOutput, toAdminAccountOutput } from '../utils/admin-account-output'

type Transaction = { accounts: AccountRepository }

/** Lecture simple (ROLE-03) : la permission `ACCOUNTS_READ` est contrôlée par la route. */
export function createListAccounts({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: async (): Promise<AdminAccountOutput[]> => {
            const accounts = await unitOfWork.run(({ accounts }) => accounts.list())
            return accounts.map(toAdminAccountOutput)
        }
    }
}

export type ListAccounts = ReturnType<typeof createListAccounts>
