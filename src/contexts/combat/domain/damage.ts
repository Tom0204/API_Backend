import { DEFENSE_CONSTANT, MIN_DAMAGE } from '../../../shared/domain/game-rules'

/** Dégâts d'une attaque de base : max(1, ⌊attaque × 100 / (100 + défense)⌋) (rules.md §6). */
export function computeDamage(attack: number, defense: number): number {
    return Math.max(MIN_DAMAGE, Math.floor((attack * DEFENSE_CONSTANT) / (DEFENSE_CONSTANT + defense)))
}
