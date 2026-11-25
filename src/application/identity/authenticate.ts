import { identityErrors } from '../../domain/identity/identity-errors'
import type { Clock } from '../ports/clock'
import type { TokenGenerator } from '../ports/token-generator'
import type { UnitOfWork } from '../ports/unit-of-work'

/** Identité transmise aux cas d'usage protégés : jamais un objet Express. */
export interface AuthContext {
    accountId: string
}

export function createAuthenticate({
    unitOfWork,
    tokenGenerator,
    clock
}: {
    unitOfWork: UnitOfWork
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
