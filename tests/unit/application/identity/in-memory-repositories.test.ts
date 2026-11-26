import { randomUUID } from 'node:crypto'
import { beforeEach } from 'vitest'
import { Email } from '../../../../src/contexts/identity/domain/email'
import { type ContractContext, describeIdentityRepositoryContract } from '../../../contracts/identity-repositories.contract'
import { InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

let context: ContractContext

beforeEach(() => {
    context = {
        unitOfWork: new InMemoryDatabase(),
        uniqueEmail: () => Email.create(`${randomUUID()}@memory.example.com`)
    }
})

describeIdentityRepositoryContract('en mémoire', () => context)
