import type { LeaderboardEntryOutput } from '../app/use-cases/get-leaderboard'

/** Liste blanche (L8 D4) : aucun identifiant de personnage ni de compte. */
export function presentLeaderboardEntry({ rank, name, classId, level, experience }: LeaderboardEntryOutput) {
    return { rank, name, classId, level, experience }
}
