import { Account } from '../../domain/identity/account'
import { Email } from '../../domain/identity/email'
import { identityErrors } from '../../domain/identity/identity-errors'
import { NewPassword } from '../../domain/identity/password'
import type { PasswordHasher } from '../ports/password-hasher'
import type { UnitOfWork } from '../ports/unit-of-work'

export interface RegisterAccountCommand {
    email: string
    password: string
}

export function createRegisterAccount({
    unitOfWork,
    passwordHasher
}: {
    unitOfWork: UnitOfWork
    passwordHasher: PasswordHasher
}) {
    return {
        execute: async (command: RegisterAccountCommand) => {
            const email = Email.create(command.email)
            const password = NewPassword.create(command.password)
            // Hachage lent (Argon2id) avant la transaction : aucune connexion n'est retenue pendant le calcul.
            const passwordHash = await passwordHasher.hash(password.value)

            return unitOfWork.run(async ({ accounts }) => {
                if (await accounts.findByEmail(email)) {
                    throw identityErrors.emailAlreadyUsed()
                }
                // En concurrence, l'index unique de la base tranche : le repository lève la même erreur.
                return accounts.insert(Account.create({ email, passwordHash }))
            })
        }
    }
}

export type RegisterAccount = ReturnType<typeof createRegisterAccount>
