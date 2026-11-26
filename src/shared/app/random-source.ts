/** Seule source d'aléatoire du jeu : le tirage du butin (rules.md §2 et §7). Injectable pour les tests. */
export interface RandomSource {
    /** Nombre uniforme dans [0, 1[. */
    next(): number
}
