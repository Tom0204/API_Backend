import type { AuthContext } from '../../../../shared/app/auth-context'
import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { SessionRepository } from '../interfaces/session-repository'

type Transaction = { sessions: SessionRepository }

/** Déconnexion de toutes les sessions du compte, y compris la courante (AUTH-02, L6 D5). */
export function createLogoutAll({ unitOfWork, clock }: { unitOfWork: UnitOfWork<Transaction>; clock: Clock }) {
    return {
        execute: async ({ accountId }: AuthContext): Promise<void> => {
            await unitOfWork.run(({ sessions }) => sessions.revokeAllByAccount(accountId, clock.now()))
        }
    }
}

export type LogoutAll = ReturnType<typeof createLogoutAll>
