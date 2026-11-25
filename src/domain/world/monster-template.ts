import type { CombatantStats } from '../combat/combatant'

/** Objet de référence que le monstre peut laisser (rules.md §8). */
export interface LootItem {
    id: string
    code: string
    name: string
}

/** Butin éventuel : objet obtenu si le tirage r est inférieur à la probabilité p (rules.md §7). */
export interface MonsterLoot {
    item: LootItem
    chance: number
}

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
    loot: MonsterLoot | null
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

    /** Tirage r uniforme dans [0, 1[ fourni par le port `RandomSource` ; objet obtenu si r < p (rules.md §7). */
    rollLoot(r: number): LootItem | null {
        if (!(r >= 0 && r < 1)) throw new Error(`Tirage hors de [0, 1[ : ${r}`) // invariant violé → 500
        const { loot } = this.props
        return loot && r < loot.chance ? loot.item : null
    }

    get snapshot(): Readonly<MonsterTemplateProps> {
        return this.props
    }
}
