import { z } from 'zod'

export const LEADERBOARD_DEFAULT_LIMIT = 20
export const LEADERBOARD_MAX_LIMIT = 100
/** Borne technique : évite un décalage démesuré envoyé tel quel à la base. */
export const LEADERBOARD_MAX_OFFSET = 1_000_000

/**
 * Entier décimal non signé lu dans la chaîne de requête (`?limit=20`) ; tableau ou objet → 400.
 * Un entier déjà converti est aussi accepté : la route relit `req.query` après `validate`, qui l'a remplacé.
 */
function integerParam(min: number, max: number, defaultValue: number) {
    const range = `Must be an integer between ${min} and ${max}`
    return z
        .union([z.int(range), z.string(range).regex(/^\d{1,7}$/, range).transform(Number)], range)
        .pipe(z.number().min(min, range).max(max, range))
        .default(defaultValue)
}

/** Pagination du classement (L8 D3, exception à conventions.md §3) ; tout autre paramètre → 400. */
export const leaderboardQuery = z.strictObject({
    limit: integerParam(1, LEADERBOARD_MAX_LIMIT, LEADERBOARD_DEFAULT_LIMIT),
    offset: integerParam(0, LEADERBOARD_MAX_OFFSET, 0)
})
