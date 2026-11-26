import { MAX_LEVEL, XP_CURVE_BASE, XP_CURVE_EXPONENT } from '../../../shared/domain/game-rules'

/** XP pour passer du niveau n à n + 1 : arrondi(100 × n^1,5) (rules.md §5). */
export function experienceRequired(level: number): number {
    return Math.round(XP_CURVE_BASE * level ** XP_CURVE_EXPONENT)
}

/** Niveau et XP acquise dans le niveau courant (rules.md §5). Immuable. */
export class Progression {
    private constructor(
        readonly level: number,
        readonly experience: number
    ) {}

    static initial(): Progression {
        return new Progression(1, 0)
    }

    /** Reconstruction depuis la base : un état incohérent est une erreur de programmation (→ 500). */
    static of(level: number, experience: number): Progression {
        const validLevel = Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL
        const validExperience =
            Number.isInteger(experience) &&
            experience >= 0 &&
            (level === MAX_LEVEL ? experience === 0 : experience < experienceRequired(level))
        if (!validLevel || !validExperience) {
            throw new Error(`Progression invalide : niveau ${level}, XP ${experience}`)
        }
        return new Progression(level, experience)
    }

    /** XP restant à gagner pour le niveau suivant ; `null` au niveau maximal. */
    get experienceToNextLevel(): number | null {
        return this.level === MAX_LEVEL ? null : experienceRequired(this.level) - this.experience
    }

    /**
     * Ajoute un gain attribué par le serveur (entier sûr ≥ 1) : passages de plusieurs niveaux possibles ;
     * au niveau 10, l'XP vaut 0 et tout reste est perdu.
     */
    gain(amount: number): { progression: Progression; levelsGained: number } {
        if (!Number.isSafeInteger(amount) || amount < 1) {
            throw new Error(`Gain d'XP invalide : ${amount}`) // invariant violé → 500
        }

        let level = this.level
        let experience = this.experience
        let remaining = amount
        while (level < MAX_LEVEL && remaining > 0) {
            const missing = experienceRequired(level) - experience
            if (remaining < missing) {
                experience += remaining
                remaining = 0
            } else {
                remaining -= missing
                level += 1
                experience = 0
            }
        }

        return { progression: new Progression(level, experience), levelsGained: level - this.level }
    }
}
