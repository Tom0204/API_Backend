import { describe, expect, it } from 'vitest'
import {
    NewPassword,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    passwordLength
} from '../../../../src/contexts/identity/domain/password'

describe('NewPassword', () => {
    it(`accepte ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caractères`, () => {
        expect(NewPassword.create('a'.repeat(PASSWORD_MIN_LENGTH)).value).toHaveLength(PASSWORD_MIN_LENGTH)
        expect(NewPassword.create('a'.repeat(PASSWORD_MAX_LENGTH)).value).toHaveLength(PASSWORD_MAX_LENGTH)
    })

    it(`refuse ${PASSWORD_MIN_LENGTH - 1} et ${PASSWORD_MAX_LENGTH + 1} caractères`, () => {
        expect(() => NewPassword.create('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toThrow()
        expect(() => NewPassword.create('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toThrow()
    })

    it('compte les caractères, pas les unités UTF-16', () => {
        const emojis = '🐺'.repeat(PASSWORD_MIN_LENGTH) // 30 unités UTF-16, 15 caractères
        expect(passwordLength(emojis)).toBe(PASSWORD_MIN_LENGTH)
        expect(() => NewPassword.create(emojis)).not.toThrow()
    })
})
