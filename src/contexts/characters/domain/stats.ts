import { MAX_LEVEL } from '../../../shared/domain/game-rules'

/** Les cinq statistiques de rules.md §3. */
export interface StatBlock {
    hp: number
    mana: number
    attack: number
    defense: number
    speed: number
}

/** Statistiques d'un personnage à un niveau donné : jamais stockées, toujours recalculées (rules.md §3). */
export class Stats implements StatBlock {
    private constructor(
        readonly hp: number,
        readonly mana: number,
        readonly attack: number,
        readonly defense: number,
        readonly speed: number
    ) {}

    /** stat(niveau) = base + gain × (niveau − 1). */
    static forLevel(source: { base: StatBlock; perLevel: StatBlock }, level: number): Stats {
        if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
            throw new Error(`Niveau invalide : ${level}`) // invariant violé → 500
        }
        const at = (stat: keyof StatBlock) => source.base[stat] + source.perLevel[stat] * (level - 1)
        return new Stats(at('hp'), at('mana'), at('attack'), at('defense'), at('speed'))
    }

    /** Hors combat, PV et mana courants valent le maximum : aucune régénération à suivre (rules.md §3). */
    get currentHp(): number {
        return this.hp
    }

    get currentMana(): number {
        return this.mana
    }
}
