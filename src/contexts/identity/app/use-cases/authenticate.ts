import type { AuthContext } from '../../../../shared/app/auth-context'
import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { identityErrors } from '../../domain/identity-errors'
import type { SessionRepository } from '../interfaces/session-repository'
import type { TokenGenerator } from '../interfaces/token-generator'

type Transaction = { sessions: SessionRepository }

export function createAuthenticate({
    unitOfWork,
    tokenGenerator,
    clock
}: {
    unitOfWork: UnitOfWork<Transaction>
    tokenGenerator: TokenGenerator
    clock: Clock
}) {
    return {
        /** Jeton inconnu ou expiré : même erreur `UNAUTHENTICATED`. */
        execute: async (token: string): Promise<AuthContext> => {
            const tokenHash = tokenGenerator.hash(token)
            const session = await unitOfWork.run(({ sessions }) => sessions.findByTokenHash(tokenHash))

            if (!session || session.isExpiredAt(clock.now())) {
                throw identityErrors.unauthenticated()
            }
            return { accountId: session.snapshot.accountId }
        }
    }
}

export type Authenticate = ReturnType<typeof createAuthenticate>
