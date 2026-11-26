import { randomUUID } from 'node:crypto'
import { beforeEach } from 'vitest'
import { createCreateCharacter } from '../../../../src/contexts/characters/app/use-cases/create-character'
import { createStartCombat } from '../../../../src/contexts/combat/app/use-cases/start-combat'
import { Account } from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'
import { uniqueCharacterName } from '../../../contracts/character-repositories.contract'
import { describeJournalRepositoryContract, type JournalContractContext } from '../../../contracts/journal-repositories.contract'
import { FixedClock } from '../../../fakes/fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

let context: JournalContractContext

beforeEach(() => {
    const database = new InMemoryDatabase()
    const clock = new FixedClock()
    const createCharacter = createCreateCharacter({ unitOfWork: database, startingZoneId: IN_MEMORY_STARTING_ZONE_ID, clock })
    const startCombat = createStartCombat({ unitOfWork: database, clock })
    context = {
        unitOfWork: database,
        createCharacterWithCombat: async () => {
            const account = await database.run(({ accounts }) =>
                accounts.insert(Account.create({ email: Email.create(`${randomUUID()}@example.com`), passwordHash: 'h' }))
            )
            const character = await createCharacter.execute({ accountId: account.id, name: uniqueCharacterName(), classId: database.classId('warrior') })
            const { combat } = await startCombat.execute({ accountId: account.id, characterId: character.id, monsterId: database.monsterId('boar') })
            // Le contrat part d'un journal vide : on retire les entrées produites par la création et le démarrage.
            database.state.gameEvents = []
            return { characterId: character.id, combatId: combat.id }
        }
    }
})

describeJournalRepositoryContract('en mémoire', () => context)
