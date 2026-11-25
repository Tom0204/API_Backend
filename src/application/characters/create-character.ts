import { Character } from '../../domain/characters/character'
import { characterErrors } from '../../domain/characters/character-errors'
import { CharacterName } from '../../domain/characters/character-name'
import { MAX_CHARACTERS_PER_ACCOUNT } from '../../domain/shared/game-rules'
import type { UnitOfWork } from '../ports/unit-of-work'

export interface CreateCharacterCommand {
    accountId: string // toujours tiré du jeton, jamais du corps
    name: string
    classId: string
}

export function createCreateCharacter({ unitOfWork, startingZoneId }: { unitOfWork: UnitOfWork; startingZoneId: string }) {
    return {
        execute: (command: CreateCharacterCommand) =>
            unitOfWork.run(async ({ characters, classes }) => {
                if (!(await classes.findById(command.classId))) {
                    throw characterErrors.classNotFound()
                }
                // Verrou sur le compte : deux créations simultanées s'exécutent l'une après l'autre.
                if ((await characters.countByAccountForUpdate(command.accountId)) >= MAX_CHARACTERS_PER_ACCOUNT) {
                    throw characterErrors.limitReached()
                }
                const name = CharacterName.create(command.name)
                if (await characters.isNameTaken(name.normalized)) {
                    throw characterErrors.nameTaken()
                }
                // Entre deux comptes, l'index unique tranche : le repository lève la même erreur.
                return characters.insert(
                    Character.create({ accountId: command.accountId, classId: command.classId, startingZoneId, name })
                )
            })
    }
}

export type CreateCharacter = ReturnType<typeof createCreateCharacter>
