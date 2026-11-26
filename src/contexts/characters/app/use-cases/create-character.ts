import type { AuthContext } from '../../../../shared/app/auth-context'
import type { Clock } from '../../../../shared/app/clock'
import type { EventPublisher } from '../../../../shared/app/event-publisher'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { MAX_CHARACTERS_PER_ACCOUNT } from '../../../../shared/domain/game-rules'
import { Character } from '../../domain/character'
import { characterErrors } from '../../domain/character-errors'
import { characterCreated } from '../../domain/character-events'
import { CharacterName } from '../../domain/character-name'
import type { CharacterClassRepository } from '../interfaces/character-class-repository'
import type { CharacterRepository } from '../interfaces/character-repository'
import { type CharacterOutput, toCharacterOutput } from '../utils/character-output'

export interface CreateCharacterInput extends AuthContext {
    name: string
    classId: string
}

type Transaction = { characters: CharacterRepository; classes: CharacterClassRepository; events: EventPublisher }

export function createCreateCharacter({
    unitOfWork,
    startingZoneId,
    clock
}: {
    unitOfWork: UnitOfWork<Transaction>
    startingZoneId: string
    clock: Clock
}) {
    return {
        execute: (input: CreateCharacterInput): Promise<CharacterOutput> =>
            unitOfWork.run(async ({ characters, classes, events }) => {
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
                await events.publish([characterCreated(character, clock.now())])
                return toCharacterOutput(character)
            })
    }
}

export type CreateCharacter = ReturnType<typeof createCreateCharacter>
