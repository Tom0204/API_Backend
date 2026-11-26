import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { identityErrors } from '../../domain/identity-errors'
import type { SessionRepository } from '../interfaces/session-repository'
import type { TokenGenerator } from '../interfaces/token-generator'
import { type SessionTokensOutput, toSessionTokensOutput } from '../utils/session-tokens-output'

export interface RefreshSessionInput {
    refreshToken: string
}

type Transaction = { sessions: SessionRepository }

/**
 * Rotation du jeton de rafraîchissement (AUTH-01). Jeton inconnu, expiré, révoqué ou déjà utilisé : même 401.
 * Un jeton déjà utilisé révoque toute sa famille (L6 D4) ; la révocation est validée avant de lever l'erreur.
 */
export function createRefreshSession({
    unitOfWork,
    tokenGenerator,
    clock
}: {
    unitOfWork: UnitOfWork<Transaction>
    tokenGenerator: TokenGenerator
    clock: Clock
}) {
    return {
        execute: async (input: RefreshSessionInput): Promise<SessionTokensOutput> => {
            const presentedHash = tokenGenerator.hash(input.refreshToken)
            const accessToken = tokenGenerator.generate()
            const refreshToken = tokenGenerator.generate()

            const output = await unitOfWork.run(async ({ sessions }) => {
                const found = await sessions.findByRefreshTokenHashForUpdate(presentedHash)
                if (!found) return undefined
                const { session, refreshToken: presented } = found
                const now = clock.now()

                if (presented.isUsed) {
                    session.revoke(now)
                    await sessions.save(session)
                    return undefined
                }
                if (!session.isRefreshableAt(now)) return undefined

                session.rotate(
                    presented,
                    {
                        accessTokenHash: tokenGenerator.hash(accessToken),
                        refreshTokenHash: tokenGenerator.hash(refreshToken)
                    },
                    now
                )
                await sessions.save(session)
                return toSessionTokensOutput(session, { accessToken, refreshToken })
            })

            if (!output) throw identityErrors.unauthenticated()
            return output
        }
    }
}

export type RefreshSession = ReturnType<typeof createRefreshSession>
