import type { Character } from '../../domain/characters/character'
import type { AuthContext } from '../identity/authenticate'
import type { UnitOfWork } from '../ports/unit-of-work'

export function createListMyCharacters({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        execute: ({ accountId }: AuthContext): Promise<Character[]> =>
            unitOfWork.run(({ characters }) => characters.findByAccount(accountId))
    }
}

export type ListMyCharacters = ReturnType<typeof createListMyCharacters>
