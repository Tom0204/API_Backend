import type { AuthContext } from '../../../../shared/app/auth-context'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { CharacterRepository } from '../interfaces/character-repository'
import { type CharacterOutput, toCharacterOutput } from '../utils/character-output'

type Transaction = { characters: CharacterRepository }

export function createListMyCharacters({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: ({ accountId }: AuthContext): Promise<CharacterOutput[]> =>
            unitOfWork.run(async ({ characters }) => (await characters.findByAccount(accountId)).map(toCharacterOutput))
    }
}

export type ListMyCharacters = ReturnType<typeof createListMyCharacters>
