import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { CharacterRepository } from '../interfaces/character-repository'

export interface GetLeaderboardInput {
    /** Bornes déjà validées par l'API (L8 D3). */
    limit: number
    offset: number
}

/** Ligne du classement (L8 D4) : ni identifiant de personnage, ni propriétaire. */
export interface LeaderboardEntryOutput {
    rank: number
    name: string
    classId: string
    level: number
    experience: number
}

type Transaction = { characters: CharacterRepository }

/** Lecture simple, tous comptes confondus ; le rang suit l'ordre de départage du repository. */
export function createGetLeaderboard({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: ({ limit, offset }: GetLeaderboardInput): Promise<LeaderboardEntryOutput[]> =>
            unitOfWork.run(async ({ characters }) =>
                (await characters.findLeaderboardPage({ limit, offset })).map((character, index) => {
                    const { name, classId, progression } = character.snapshot
                    return {
                        rank: offset + index + 1,
                        name: name.value,
                        classId,
                        level: progression.level,
                        experience: progression.experience
                    }
                })
            )
    }
}

export type GetLeaderboard = ReturnType<typeof createGetLeaderboard>
