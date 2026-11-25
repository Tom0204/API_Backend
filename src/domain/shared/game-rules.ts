/**
 * Paramètres de `docs/rules.md` §9 : seul emplacement de ces valeurs dans le code.
 * Les données de référence (classes, zones, monstres, objets) vivent dans le seed.
 *
 * Exception assumée : la migration initiale reprend MAX_LEVEL et la longueur du nom dans des contraintes CHECK
 * (`characters_level_range`, `characters_name_format`, `characters_max_level_without_experience`).
 * Changer l'une de ces valeurs exige une nouvelle migration qui met ces contraintes à jour.
 */

/** rules.md §5 */
export const MAX_LEVEL = 10

/** rules.md §4 */
export const MAX_CHARACTERS_PER_ACCOUNT = 5

/** rules.md §4 : 3 à 16 lettres A–Z / a–z, sans accent, espace ni chiffre. */
export const CHARACTER_NAME_MIN_LENGTH = 3
export const CHARACTER_NAME_MAX_LENGTH = 16
export const CHARACTER_NAME_PATTERN = new RegExp(
    `^[A-Za-z]{${CHARACTER_NAME_MIN_LENGTH},${CHARACTER_NAME_MAX_LENGTH}}$`
)

/** rules.md §5 : xpRequise(n) = arrondi(XP_CURVE_BASE × n^XP_CURVE_EXPONENT). */
export const XP_CURVE_BASE = 100
export const XP_CURVE_EXPONENT = 1.5

/** rules.md §6 : dégâts = max(MIN_DAMAGE, ⌊attaque × DEFENSE_CONSTANT / (DEFENSE_CONSTANT + défense)⌋). */
export const DEFENSE_CONSTANT = 100
export const MIN_DAMAGE = 1

/** rules.md §8 : code de la zone de départ dans les données de référence. */
export const STARTING_ZONE_CODE = 'clearing'
