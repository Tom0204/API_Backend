import type { Character } from '../../domain/characters/character'
import type { AuthContext } from '../identity/authenticate'
import type { UnitOfWork } from '../ports/unit-of-work'
import { findOwnedCharacter } from './find-owned-character'

export interface GetMyCharacterQuery extends AuthContext {
    characterId: string
}

export function createGetMyCharacter({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        execute: ({ accountId, characterId }: GetMyCharacterQuery): Promise<Character> =>
            unitOfWork.run(({ characters }) => findOwnedCharacter(characters, characterId, accountId))
    }
}

export type GetMyCharacter = ReturnType<typeof createGetMyCharacter>
