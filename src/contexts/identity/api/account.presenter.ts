import type { AccountOutput } from '../app/utils/account-output'
import type { SessionTokensOutput } from '../app/utils/session-tokens-output'

/** Liste blanche : jamais de hash de mot de passe ni d'état de verrouillage. */
export function presentAccount({ id, email, createdAt }: AccountOutput) {
    return { id, email, createdAt: createdAt.toISOString() }
}

/** Connexion et rafraîchissement (L6 D3). */
export function presentSessionTokens({ accessToken, refreshToken, accessExpiresAt, refreshExpiresAt }: SessionTokensOutput) {
    return {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        accessExpiresAt: accessExpiresAt.toISOString(),
        refreshExpiresAt: refreshExpiresAt.toISOString()
    }
}
