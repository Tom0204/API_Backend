import { MAX_CHARACTERS_PER_ACCOUNT } from '../../../../shared/domain/game-rules'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { Character } from '../../domain/character'
import { characterErrors } from '../../domain/character-errors'
import { CharacterName } from '../../domain/character-name'
import type { CharacterClassRepository } from '../interfaces/character-class-repository'
import type { CharacterRepository } from '../interfaces/character-repository'
import { type CharacterOutput, toCharacterOutput } from '../utils/character-output'

export interface CreateCharacterInput {
    accountId: string // toujours tiré du jeton, jamais du corps
    name: string
    classId: string
}

type Transaction = { characters: CharacterRepository; classes: CharacterClassRepository }

export function createCreateCharacter({
    unitOfWork,
    startingZoneId
}: {
    unitOfWork: UnitOfWork<Transaction>
    startingZoneId: string
}) {
    return {
        execute: (input: CreateCharacterInput): Promise<CharacterOutput> =>
            unitOfWork.run(async ({ characters, classes }) => {
                if (!(await classes.findById(input.classId))) {
                    throw characterErrors.classNotFound()
                }
                // Verrou sur le compte : deux créations simultanées s'exécutent l'une après l'autre.
                if ((await characters.countByAccountForUpdate(input.accountId)) >= MAX_CHARACTERS_PER_ACCOUNT) {
                    throw characterErrors.limitReached()
                }
                const name = CharacterName.create(input.name)
                if (await characters.isNameTaken(name.normalized)) {
                    throw characterErrors.nameTaken()
                }
                // Entre deux comptes, l'index unique tranche : le repository lève la même erreur.
                const character = await characters.insert(
                    Character.create({ accountId: input.accountId, classId: input.classId, startingZoneId, name })
                )
                return toCharacterOutput(character)
            })
    }
}

export type CreateCharacter = ReturnType<typeof createCreateCharacter>
