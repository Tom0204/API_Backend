import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { Account } from '../../domain/account'
import { Email } from '../../domain/email'
import { identityErrors } from '../../domain/identity-errors'
import { Session } from '../../domain/session'
import type { AccountRepository } from '../interfaces/account-repository'
import type { PasswordHasher } from '../interfaces/password-hasher'
import type { SessionRepository } from '../interfaces/session-repository'
import type { TokenGenerator } from '../interfaces/token-generator'

export interface LoginInput {
    email: string
    password: string
}

export interface LoginOutput {
    /** Jeton en clair : renvoyé une seule fois, jamais stocké ni journalisé. */
    token: string
    expiresAt: Date
}

type Transaction = { accounts: AccountRepository; sessions: SessionRepository }

/** Mot de passe du hash factice : aucun compte ne peut l'utiliser, il ne sert qu'à égaliser les délais. */
const TIMING_DUMMY_PASSWORD = 'timing-equalization-dummy-password'

export function createLogin({
    unitOfWork,
    passwordHasher,
    tokenGenerator,
    clock
}: {
    unitOfWork: UnitOfWork<Transaction>
    passwordHasher: PasswordHasher
    tokenGenerator: TokenGenerator
    clock: Clock
}) {
    // Calculé dès la construction : même la première requête avec un email inconnu ne paie qu'une vérification.
    const computeDummyHash = () => {
        const hash = passwordHasher.hash(TIMING_DUMMY_PASSWORD)
        hash.catch(() => undefined) // échec traité à l'usage, jamais en rejet non intercepté
        return hash
    }
    let dummyHash = computeDummyHash()

    async function hashToVerify(account: Account | undefined): Promise<string> {
        if (account) return account.snapshot.passwordHash
        try {
            return await dummyHash
        } catch (error) {
            dummyHash = computeDummyHash() // un échec n'est pas conservé en cache
            throw error
        }
    }

    return {
        execute: async (input: LoginInput): Promise<LoginOutput> => {
            const email = Email.create(input.email)
            const account = await unitOfWork.run(({ accounts }) => accounts.findByEmail(email))

            // D7 : un email inconnu coûte une vérification Argon2, comme un mauvais mot de passe.
            const passwordHash = await hashToVerify(account)
            const passwordMatches = await passwordHasher.verify(passwordHash, input.password)

            if (!account || !passwordMatches) {
                throw identityErrors.invalidCredentials()
            }

            const token = tokenGenerator.generate()
            const session = await unitOfWork.run(({ sessions }) =>
                sessions.insert(
                    Session.open({ accountId: account.id, tokenHash: tokenGenerator.hash(token), now: clock.now() })
                )
            )
            return { token, expiresAt: session.snapshot.expiresAt }
        }
    }
}

export type Login = ReturnType<typeof createLogin>
