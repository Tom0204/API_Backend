import { describe, expect, it } from 'vitest'
import { createCryptoRandomSource } from '../../../src/platform/system/crypto-random-source'

describe('createCryptoRandomSource', () => {
    it('renvoie des nombres dans [0, 1[, répartis sur tout l’intervalle', () => {
        const random = createCryptoRandomSource()

        const draws = Array.from({ length: 2000 }, () => random.next())

        expect(draws.every((r) => r >= 0 && r < 1)).toBe(true)
        // 2000 tirages : chaque dixième de l'intervalle est atteint (probabilité d'échec négligeable).
        expect(new Set(draws.map((r) => Math.floor(r * 10))).size).toBe(10)
    })
})
