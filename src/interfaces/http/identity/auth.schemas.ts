import { z } from 'zod'
import { EMAIL_MAX_LENGTH } from '../../../domain/identity/email'
import {
    isAcceptablePassword,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    passwordLength
} from '../../../domain/identity/password'

const email = z.email('Must be a valid email').max(EMAIL_MAX_LENGTH, `Must be at most ${EMAIL_MAX_LENGTH} characters`)

export const registerBody = z.strictObject({
    email,
    password: z.string('Must be a string').refine(isAcceptablePassword, `Must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`)
})

/** D4 : pas de minimum de 15 au login, pour qu'un changement de politique ne bloque aucun compte existant. */
export const loginBody = z.strictObject({
    email,
    password: z
        .string('Must be a string')
        .refine(
            (value) => passwordLength(value) >= 1 && passwordLength(value) <= PASSWORD_MAX_LENGTH,
            `Must be 1 to ${PASSWORD_MAX_LENGTH} characters`
        )
})
