import { randomUUID } from 'node:crypto'
import { beforeEach } from 'vitest'
import { createCreateCharacter } from '../../../../src/application/characters/create-character'
import { Account } from '../../../../src/domain/identity/account'
import { Email } from '../../../../src/domain/identity/email'
import { uniqueCharacterName } from '../../../contracts/character-repositories.contract'
import { type CombatContractContext, describeCombatRepositoryContract } from '../../../contracts/combat-repositories.contract'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

let context: CombatContractContext

beforeEach(() => {
    const database = new InMemoryDatabase()
    const createCharacter = createCreateCharacter({ unitOfWork: database, startingZoneId: IN_MEMORY_STARTING_ZONE_ID })
    context = {
        unitOfWork: database,
        createCharacter: async () => {
            const account = await database.run(({ accounts }) =>
                accounts.insert(Account.create({ email: Email.create(`${randomUUID()}@example.com`), passwordHash: 'h' }))
            )
            const character = await createCharacter.execute({
                accountId: account.id,
                name: uniqueCharacterName(),
                classId: database.classId('warrior')
            })
            return character.id
        },
        startingZoneId: IN_MEMORY_STARTING_ZONE_ID,
        wolfId: database.monsterId('wolf')
    }
})

describeCombatRepositoryContract('en mémoire', () => context)
