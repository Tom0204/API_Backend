import type { AuthContext } from '../../../../shared/app/auth-context'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { CharacterRepository } from '../interfaces/character-repository'
import { type CharacterOutput, toCharacterOutput } from '../utils/character-output'
import { findOwnedCharacter } from '../utils/find-owned-character'

export interface GetMyCharacterInput extends AuthContext {
    characterId: string
}

type Transaction = { characters: CharacterRepository }

export function createGetMyCharacter({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: ({ accountId, characterId }: GetMyCharacterInput): Promise<CharacterOutput> =>
            unitOfWork.run(async ({ characters }) =>
                toCharacterOutput(await findOwnedCharacter(characters, characterId, accountId))
            )
    }
}

export type GetMyCharacter = ReturnType<typeof createGetMyCharacter>
