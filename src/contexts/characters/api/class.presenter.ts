import type { ClassOutput, StatValues } from '../app/use-cases/list-classes'

/** Liste blanche (L2 D1). */
export function presentCharacterClass({ id, code, name, baseStats, statsPerLevel }: ClassOutput) {
    return { id, code, name, baseStats: presentStatValues(baseStats), statsPerLevel: presentStatValues(statsPerLevel) }
}

function presentStatValues({ hp, mana, attack, defense, speed }: StatValues) {
    return { hp, mana, attack, defense, speed }
}
