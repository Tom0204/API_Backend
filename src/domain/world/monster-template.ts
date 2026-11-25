import type { CombatantStats } from '../combat/combatant'

export interface MonsterTemplateProps {
    id: string
    code: string
    zoneId: string
    name: string
    level: number
    hp: number
    attack: number
    defense: number
    speed: number
    xpReward: number
}

/** Modèle de monstre (rules.md §8) : chaque combat en crée sa propre instance. */
export class MonsterTemplate {
    private constructor(private readonly props: MonsterTemplateProps) {}

    static restore(props: MonsterTemplateProps): MonsterTemplate {
        return new MonsterTemplate(props)
    }

    get id(): string {
        return this.props.id
    }

    livesIn(zoneId: string): boolean {
        return this.props.zoneId === zoneId
    }

    /** Statistiques figées par un nouveau combat. */
    get combatStats(): CombatantStats {
        const { hp, attack, defense, speed } = this.props
        return { maxHp: hp, attack, defense, speed }
    }

    get snapshot(): Readonly<MonsterTemplateProps> {
        return this.props
    }
}
