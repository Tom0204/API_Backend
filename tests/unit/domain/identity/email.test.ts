import { describe, expect, it } from 'vitest'
import { Email, EMAIL_MAX_LENGTH } from '../../../../src/contexts/identity/domain/email'

describe('Email', () => {
    it('est normalisé en minuscules', () => {
        expect(Email.create('Alice.Martin@Example.COM').value).toBe('alice.martin@example.com')
    })

    it('deux casses différentes désignent le même email', () => {
        expect(Email.create('BOB@example.com').equals(Email.create('bob@EXAMPLE.com'))).toBe(true)
    })

    it.each(['', 'sans-arobase', 'deux@@example.com', 'espace @example.com', ' bob@example.com'])(
        'refuse une forme invalide : %j',
        (raw) => {
            expect(() => Email.create(raw)).toThrow('Adresse email invalide')
        }
    )

    it(`accepte ${EMAIL_MAX_LENGTH} caractères et refuse au-delà`, () => {
        const local = 'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length)
        expect(Email.create(`${local}@example.com`).value).toHaveLength(EMAIL_MAX_LENGTH)
        expect(() => Email.create(`a${local}@example.com`)).toThrow()
    })

    it("ne cite jamais la valeur refusée dans l'erreur", () => {
        expect(() => Email.create('secret value')).toThrow(/^Adresse email invalide$/)
    })
})
