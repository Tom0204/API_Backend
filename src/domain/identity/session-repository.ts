import type { NewSession, Session } from './session'

export interface SessionRepository {
    findByTokenHash(tokenHash: string): Promise<Session | undefined>
    insert(session: NewSession): Promise<Session>
}
