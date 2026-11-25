import { createHash, randomBytes } from 'node:crypto'
import type { TokenGenerator } from '../../application/ports/token-generator'

const TOKEN_BYTES = 32

export function createCryptoTokenGenerator(): TokenGenerator {
    return {
        generate: () => randomBytes(TOKEN_BYTES).toString('base64url'),
        hash: (token) => createHash('sha256').update(token).digest('hex')
    }
}
