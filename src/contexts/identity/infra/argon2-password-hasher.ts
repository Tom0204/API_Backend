import argon2 from 'argon2'
import type { PasswordHasher } from '../app/interfaces/password-hasher'

/** Argon2id avec les paramètres par défaut de la bibliothèque (64 Mio, 3 passes). */
export function createArgon2PasswordHasher(): PasswordHasher {
    return {
        hash: (plainPassword) => argon2.hash(plainPassword, { type: argon2.argon2id }),
        verify: async (passwordHash, plainPassword) => {
            try {
                return await argon2.verify(passwordHash, plainPassword)
            } catch {
                return false // hash illisible : traité comme un mot de passe faux
            }
        }
    }
}
