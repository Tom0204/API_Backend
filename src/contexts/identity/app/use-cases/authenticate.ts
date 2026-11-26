import type { SessionAuthContext } from '../../../../shared/app/auth-context'
import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { identityErrors } from '../../domain/identity-errors'
import type { PermissionName } from '../../domain/permissions'
import type { AccountRepository } from '../interfaces/account-repository'
import type { SessionRepository } from '../interfaces/session-repository'
import type { TokenGenerator } from '../interfaces/token-generator'
import { assertPermission } from '../utils/assert-permission'

/** Permission exigée par une route (`requirePermission`) ; déclarée ici pour que la couche api n'importe pas le domaine. */
export type RequiredPermission = PermissionName

type Transaction = { sessions: SessionRepository; accounts: AccountRepository }

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
        /**
         * Jeton d'accès inconnu, remplacé par une rotation, expiré, de session révoquée ou de compte suspendu :
         * même `UNAUTHENTICATED` (L7 D7). Les permissions sont relues en base à chaque requête, jamais tirées du
         * jeton : un retrait de droit prend effet à la requête suivante (ROLE-02). Permission absente → `FORBIDDEN`.
         */
        execute: async (accessToken: string, required?: RequiredPermission): Promise<SessionAuthContext> => {
            const accessTokenHash = tokenGenerator.hash(accessToken)
            const found = await unitOfWork.run(async ({ sessions, accounts }) => {
                const session = await sessions.findByAccessTokenHash(accessTokenHash)
                if (!session?.acceptsAccessAt(clock.now())) return undefined
                const account = await accounts.findById(session.snapshot.accountId)
                return account && { session, account }
            })

            if (!found || found.account.isSuspended) throw identityErrors.unauthenticated()
            if (required) assertPermission(found.account.permissions, required)
            return { accountId: found.account.id, sessionId: found.session.id }
        }
    }
}

export type Authenticate = ReturnType<typeof createAuthenticate>
