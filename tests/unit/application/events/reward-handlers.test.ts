import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createGrantCombatExperience } from '../../../../src/contexts/characters/app/handlers/grant-combat-experience'
import { createCreateCharacter } from '../../../../src/contexts/characters/app/use-cases/create-character'
import { Account } from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'
import { createAwardCombatLoot } from '../../../../src/contexts/inventory/app/handlers/award-combat-loot'
import type { DomainEvent } from '../../../../src/shared/domain/domain-event'
import { FixedClock, FixedRandom } from '../../../fakes/fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'

const at = new Date('2026-11-26T10:00:00.000Z')

async function setup() {
    const database = new InMemoryDatabase()
    const createCharacter = createCreateCharacter({ unitOfWork: database, startingZoneId: IN_MEMORY_STARTING_ZONE_ID, clock: new FixedClock() })
    const account = await database.run(({ accounts }) =>
        accounts.insert(Account.create({ email: Email.create(`${randomUUID()}@example.com`), passwordHash: 'h' }))
    )
    const character = await createCharacter.execute({ accountId: account.id, name: 'Thrall', classId: database.classId('warrior') })
    const combatWon = (monsterCode: string): DomainEvent & Record<string, unknown> => ({
        type: 'CombatWon',
        occurredAt: at,
        combatId: 'combat-1',
        characterId: character.id,
        monsterId: database.monsterId(monsterCode)
    })
    return { database, characterId: character.id, combatWon }
}

describe('handlers de CombatWon, isolément (EVT-02)', () => {
    it('characters : XP fixe du monstre, ExperienceGranted ; passage de niveau → CharacterLeveledUp', async () => {
        const ctx = await setup()
        const handler = createGrantCombatExperience()

        const first = await ctx.database.run((tx) => handler.handle(ctx.combatWon('wolf'), tx))
        const record = ctx.database.state.characters.find((c) => c.id === ctx.characterId)
        if (record) record.experience = 90
        const second = await ctx.database.run((tx) => handler.handle(ctx.combatWon('bandit'), tx))

        expect(first).toEqual([
            { type: 'ExperienceGranted', occurredAt: at, characterId: ctx.characterId, combatId: 'combat-1', amount: 25, levelsGained: 0, level: 1, experience: 25 }
        ])
        expect(second.map((e) => e.type)).toEqual(['ExperienceGranted', 'CharacterLeveledUp'])
        expect(ctx.database.state.characters.find((c) => c.id === ctx.characterId)).toMatchObject({ level: 2, experience: 50 })
    })

    it('inventory : tirage 0,31 → LootAwarded et objet ajouté ; 0,9 → rien', async () => {
        const ctx = await setup()
        const lucky = createAwardCombatLoot({ random: new FixedRandom(0.31) })
        const unlucky = createAwardCombatLoot({ random: new FixedRandom(0.9) })

        const won = await ctx.database.run((tx) => lucky.handle(ctx.combatWon('wolf'), tx))
        const nothing = await ctx.database.run((tx) => unlucky.handle(ctx.combatWon('wolf'), tx))

        expect(won).toEqual([
            {
                type: 'LootAwarded',
                occurredAt: at,
                characterId: ctx.characterId,
                combatId: 'combat-1',
                item: ctx.database.item('wolf-pelt'),
                quantity: 1
            }
        ])
        expect(nothing).toEqual([])
        expect(ctx.database.state.inventoryItems).toEqual([{ characterId: ctx.characterId, itemId: ctx.database.item('wolf-pelt').id, quantity: 1 }])
    })

    it('un événement d’un autre type est une erreur de câblage', async () => {
        const ctx = await setup()

        await expect(ctx.database.run((tx) => createGrantCombatExperience().handle({ type: 'CombatLost', occurredAt: at }, tx))).rejects.toThrow('inattendu')
        await expect(
            ctx.database.run((tx) => createAwardCombatLoot({ random: new FixedRandom() }).handle({ type: 'CombatLost', occurredAt: at }, tx))
        ).rejects.toThrow('inattendu')
    })
})
