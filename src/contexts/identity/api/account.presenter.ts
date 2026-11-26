import type { LoginOutput } from '../app/use-cases/login'
import type { AccountOutput } from '../app/utils/account-output'

/** Liste blanche : jamais de hash de mot de passe. */
export function presentAccount({ id, email, createdAt }: AccountOutput) {
    return { id, email, createdAt: createdAt.toISOString() }
}

export function presentSession(session: LoginOutput) {
    return { token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt.toISOString() }
}
