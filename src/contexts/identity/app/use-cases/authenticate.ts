import type { SessionAuthContext } from '../../../../shared/app/auth-context'
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
        /** Jeton d'accès inconnu, remplacé par une rotation, expiré ou de session révoquée : même `UNAUTHENTICATED`. */
        execute: async (accessToken: string): Promise<SessionAuthContext> => {
            const accessTokenHash = tokenGenerator.hash(accessToken)
            const session = await unitOfWork.run(({ sessions }) => sessions.findByAccessTokenHash(accessTokenHash))

            if (!session?.acceptsAccessAt(clock.now())) {
                throw identityErrors.unauthenticated()
            }
            return { accountId: session.snapshot.accountId, sessionId: session.id }
        }
    }
}

export type Authenticate = ReturnType<typeof createAuthenticate>
