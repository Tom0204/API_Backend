import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { Account } from '../../domain/account'
import { Email } from '../../domain/email'
import { identityErrors } from '../../domain/identity-errors'
import { NewPassword } from '../../domain/password'
import type { AccountRepository } from '../interfaces/account-repository'
import type { PasswordHasher } from '../interfaces/password-hasher'
import { type AccountOutput, toAccountOutput } from '../utils/account-output'

export interface RegisterAccountInput {
    email: string
    password: string
}

type Transaction = { accounts: AccountRepository }

export function createRegisterAccount({
    unitOfWork,
    passwordHasher
}: {
    unitOfWork: UnitOfWork<Transaction>
    passwordHasher: PasswordHasher
}) {
    return {
        execute: async (input: RegisterAccountInput): Promise<AccountOutput> => {
            const email = Email.create(input.email)
            const password = NewPassword.create(input.password)
            // Hachage lent (Argon2id) avant la transaction : aucune connexion n'est retenue pendant le calcul.
            const passwordHash = await passwordHasher.hash(password.value)

            return unitOfWork.run(async ({ accounts }) => {
                if (await accounts.findByEmail(email)) {
                    throw identityErrors.emailAlreadyUsed()
                }
                // En concurrence, l'index unique de la base tranche : le repository lève la même erreur.
                return toAccountOutput(await accounts.insert(Account.create({ email, passwordHash })))
            })
        }
    }
}

export type RegisterAccount = ReturnType<typeof createRegisterAccount>
