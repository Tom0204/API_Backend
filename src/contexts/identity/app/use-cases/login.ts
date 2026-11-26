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
import { type SessionTokensOutput, toSessionTokensOutput } from '../utils/session-tokens-output'

export interface LoginInput {
    email: string
    password: string
}

export type LoginOutput = SessionTokensOutput

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

            // L1 D7 : un email inconnu coûte une vérification Argon2, comme un mauvais mot de passe.
            // L6 D6 : la vérification a lieu même si le compte est verrouillé, hors de toute transaction.
            const passwordHash = await hashToVerify(account)
            const passwordMatches = await passwordHasher.verify(passwordHash, input.password)
            if (!account) throw identityErrors.invalidCredentials()

            const accessToken = tokenGenerator.generate()
            const refreshToken = tokenGenerator.generate()

            // Verrou sur le compte : des échecs simultanés sont tous comptés (AUTH-03). Un échec renvoie `undefined`
            // au lieu de lever une erreur, pour que le compteur soit validé avec la transaction.
            const output = await unitOfWork.run(async ({ accounts, sessions }) => {
                const locked = await accounts.findByIdForUpdate(account.id)
                if (!locked) return undefined
                const now = clock.now()
                const accepted = locked.attemptLogin(passwordMatches, now)
                await accounts.save(locked)
                if (!accepted) return undefined

                const session = await sessions.insert(
                    Session.open({
                        accountId: locked.id,
                        accessTokenHash: tokenGenerator.hash(accessToken),
                        refreshTokenHash: tokenGenerator.hash(refreshToken),
                        now
                    })
                )
                return toSessionTokensOutput(session, { accessToken, refreshToken })
            })

            // Mauvais mot de passe, compte verrouillé ou supprimé entre-temps : même réponse qu'un email inconnu.
            if (!output) throw identityErrors.invalidCredentials()
            return output
        }
    }
}

export type Login = ReturnType<typeof createLogin>
