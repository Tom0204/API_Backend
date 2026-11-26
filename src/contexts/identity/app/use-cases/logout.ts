import type { SessionAuthContext } from '../../../../shared/app/auth-context'
import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { SessionRepository } from '../interfaces/session-repository'

type Transaction = { sessions: SessionRepository }

/** Déconnexion de la session courante (AUTH-02) : son jeton d'accès et ses jetons de rafraîchissement → 401. */
export function createLogout({ unitOfWork, clock }: { unitOfWork: UnitOfWork<Transaction>; clock: Clock }) {
    return {
        execute: ({ sessionId }: SessionAuthContext): Promise<void> =>
            unitOfWork.run(async ({ sessions }) => {
                // Verrou sur la session : une rotation simultanée s'exécute avant ou après, jamais entre les deux.
                const session = await sessions.findByIdForUpdate(sessionId)
                if (!session) return // supprimée avec son compte entre l'authentification et ici
                session.revoke(clock.now())
                await sessions.save(session)
            })
    }
}

export type Logout = ReturnType<typeof createLogout>
