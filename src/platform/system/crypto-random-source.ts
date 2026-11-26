import { randomBytes } from 'node:crypto'
import type { RandomSource } from '../../shared/app/random-source'

/** 6 octets aléatoires = entier k uniforme dans [0, 2^48[ ; r = k / 2^48 est uniforme dans [0, 1[. */
const BYTES = 6
const RANGE = 2 ** (8 * BYTES)

export function createCryptoRandomSource(): RandomSource {
    return { next: () => randomBytes(BYTES).readUIntBE(0, BYTES) / RANGE }
}
