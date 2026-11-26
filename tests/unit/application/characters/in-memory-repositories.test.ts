import { randomUUID } from 'node:crypto'
import { beforeEach } from 'vitest'
import { Account } from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'
import {
    type CharacterContractContext,
    describeCharacterRepositoryContract
} from '../../../contracts/character-repositories.contract'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

let context: CharacterContractContext

beforeEach(() => {
    const database = new InMemoryDatabase()
    context = {
        unitOfWork: database,
        createAccount: async () =>
            (
                await database.run(({ accounts }) =>
                    accounts.insert(Account.create({ email: Email.create(`${randomUUID()}@example.com`), passwordHash: 'h' }))
                )
            ).id,
        warriorClassId: database.classId('warrior'),
        startingZoneId: IN_MEMORY_STARTING_ZONE_ID
    }
})

describeCharacterRepositoryContract('en mémoire', () => context)
