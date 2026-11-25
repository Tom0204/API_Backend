export const EMAIL_MAX_LENGTH = 254

/** Forme minimale d'une adresse ; le format complet est vérifié par Zod en HTTP. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/

export class Email {
    private constructor(readonly value: string) {}

    /** Normalisée en minuscules : deux casses différentes désignent le même compte. */
    static create(raw: string): Email {
        if (raw.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(raw)) {
            throw new Error('Adresse email invalide') // invariant violé → 500 ; la valeur n'est jamais citée
        }
        return new Email(raw.toLowerCase())
    }

    equals(other: Email): boolean {
        return this.value === other.value
    }
}
