import type { IssuedSession } from '../../../application/identity/login'
import type { Account } from '../../../domain/identity/account'

/** Liste blanche : jamais de hash de mot de passe. */
export function presentAccount(account: Account) {
    const { id, email, createdAt } = account.snapshot
    return { id, email: email.value, createdAt: createdAt.toISOString() }
}

export function presentSession(session: IssuedSession) {
    return { token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt.toISOString() }
}
