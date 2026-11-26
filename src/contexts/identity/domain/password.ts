export const PASSWORD_MIN_LENGTH = 15
export const PASSWORD_MAX_LENGTH = 128

/** Longueur en caractères (points de code), pas en unités UTF-16 : un emoji compte pour un. */
export function passwordLength(raw: string): number {
    return [...raw].length
}

export function isAcceptablePassword(raw: string): boolean {
    const length = passwordLength(raw)
    return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH
}

/** Mot de passe en clair choisi à l'inscription : n'existe qu'en mémoire, le temps d'être haché. */
export class NewPassword {
    private constructor(readonly value: string) {}

    static create(raw: string): NewPassword {
        if (!isAcceptablePassword(raw)) {
            throw new Error('Mot de passe hors des longueurs autorisées') // invariant violé → 500
        }
        return new NewPassword(raw)
    }
}
