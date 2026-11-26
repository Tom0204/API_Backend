import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { RoleName } from '../../domain/permissions'
import type { AccountRepository } from '../interfaces/account-repository'
import { type AdminAccountOutput, toAdminAccountOutput } from '../utils/admin-account-output'
import { type AdministrationInput, findAdministrableAccount } from '../utils/find-administrable-account'

export interface ChangeAccountRoleInput extends AdministrationInput {
    role: RoleName
}

type Transaction = { accounts: AccountRepository }

/**
 * Attribution d'un rôle nommé (ROLE-03, L7 D3). Le nouveau rôle est relu à la requête suivante du compte visé
 * (ROLE-02) : ses sessions restent ouvertes.
 */
export function createChangeAccountRole({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: ({ role, ...input }: ChangeAccountRoleInput): Promise<AdminAccountOutput> =>
            unitOfWork.run(async ({ accounts }) => {
                const { actor, target } = await findAdministrableAccount(accounts, input)
                target.changeRole(actor, role)
                await accounts.save(target)
                return toAdminAccountOutput(target)
            })
    }
}

export type ChangeAccountRole = ReturnType<typeof createChangeAccountRole>
