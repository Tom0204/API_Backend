/** Hachage lent des mots de passe (Argon2id en production). */
export interface PasswordHasher {
    hash(plainPassword: string): Promise<string>
    /** `false` pour un mot de passe faux ; ne lève jamais d'erreur pour un hash illisible. */
    verify(passwordHash: string, plainPassword: string): Promise<boolean>
}
