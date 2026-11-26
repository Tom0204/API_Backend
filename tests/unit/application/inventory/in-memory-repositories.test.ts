import { randomUUID } from 'node:crypto'
import { beforeEach } from 'vitest'
import { createCreateCharacter } from '../../../../src/contexts/characters/app/use-cases/create-character'
import { Account } from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'
import { uniqueCharacterName } from '../../../contracts/character-repositories.contract'
import {
    describeInventoryRepositoryContract,
    type InventoryContractContext
} from '../../../contracts/inventory-repositories.contract'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'
import { FixedClock } from '../../../fakes/fake-ports'

let context: InventoryContractContext

beforeEach(() => {
    const database = new InMemoryDatabase()
    const createCharacter = createCreateCharacter({ unitOfWork: database, startingZoneId: IN_MEMORY_STARTING_ZONE_ID, clock: new FixedClock() })
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
        items: { pelt: database.item('wolf-pelt'), tusk: database.item('boar-tusk') }
    }
})

describeInventoryRepositoryContract('en mémoire', () => context)
