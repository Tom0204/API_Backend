/** Statistiques figées au début du combat (rules.md §6). */
export interface CombatantStats {
    maxHp: number
    attack: number
    defense: number
    speed: number
}

/** Participant d'un combat : statistiques figées et PV courants, bornés à 0. Immuable. */
export class Combatant {
    private constructor(
        readonly stats: Readonly<CombatantStats>,
        readonly hp: number
    ) {}

    /** Chacun commence avec ses PV au maximum (rules.md §6). */
    static fresh(stats: CombatantStats): Combatant {
        return Combatant.of(stats, stats.maxHp)
    }

    /** Reconstruction : un état incohérent est une erreur de programmation (→ 500). */
    static of(stats: CombatantStats, hp: number): Combatant {
        const valid =
            [stats.maxHp, stats.attack, stats.speed].every((value) => Number.isInteger(value) && value > 0) &&
            Number.isInteger(stats.defense) &&
            stats.defense >= 0 &&
            Number.isInteger(hp) &&
            hp >= 0 &&
            hp <= stats.maxHp
        if (!valid) throw new Error('Participant de combat invalide')
        return new Combatant({ ...stats }, hp)
    }

    get isDefeated(): boolean {
        return this.hp === 0
    }

    takeDamage(damage: number): Combatant {
        return new Combatant(this.stats, Math.max(0, this.hp - damage))
    }
}
