import type { CharacterClass } from '../../../domain/characters/character-class'
import type { StatBlock } from '../../../domain/characters/stats'

/** Liste blanche (D1). */
export function presentCharacterClass(characterClass: CharacterClass) {
    const { id, code, name, base, perLevel } = characterClass.snapshot
    return { id, code, name, baseStats: presentStatBlock(base), statsPerLevel: presentStatBlock(perLevel) }
}

function presentStatBlock({ hp, mana, attack, defense, speed }: StatBlock) {
    return { hp, mana, attack, defense, speed }
}
