import { describe, expect, it } from 'vitest'
import type { GameEventEntry } from '../../src/contexts/journal/domain/game-event-entry'
import type { AppTransaction } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'

export interface JournalContractContext {
    unitOfWork: UnitOfWork<AppTransaction>
    /** Crée un personnage propre au test, avec un combat ; renvoie leurs identifiants. */
    createCharacterWithCombat(): Promise<{ characterId: string; combatId: string }>
}

/** Même contrat pour les repositories en mémoire et Prisma (AGENTS.md §6). */
export function describeJournalRepositoryContract(name: string, getContext: () => JournalContractContext) {
    describe(`contrat du repository journal — ${name}`, () => {
        const entry = (overrides: Partial<GameEventEntry> & Pick<GameEventEntry, 'characterId'>): GameEventEntry => ({
            type: 'CombatTurnPlayed',
            combatId: null,
            payload: { attacker: 'MONSTER', damage: 7, nested: { list: [1, 'deux', null, true] } },
            occurredAt: new Date('2026-11-26T10:00:00.000Z'),
            ...overrides
        })

        it('enregistre puis relit les entrées d’un personnage et d’un combat, dans l’ordre d’écriture', async () => {
            const ctx = getContext()
            const { characterId, combatId } = await ctx.createCharacterWithCombat()
            const sameInstant = new Date('2026-11-26T10:00:00.000Z')
            const later = new Date('2026-11-26T10:00:01.000Z')

            await ctx.unitOfWork.run(async ({ journal }) => {
                await journal.append(entry({ characterId, type: 'CharacterCreated', payload: { name: 'Thrall' }, occurredAt: sameInstant }))
                await journal.append(entry({ characterId, combatId, type: 'CombatStarted', payload: {}, occurredAt: sameInstant }))
                await journal.append(entry({ characterId, combatId, occurredAt: later }))
            })
            const byCharacter = await ctx.unitOfWork.run(({ journal }) => journal.findByCharacter(characterId))
            const byCombat = await ctx.unitOfWork.run(({ journal }) => journal.findByCombat(combatId))

            expect(byCharacter.map((e) => e.type)).toEqual(['CharacterCreated', 'CombatStarted', 'CombatTurnPlayed'])
            expect(byCombat.map((e) => e.type)).toEqual(['CombatStarted', 'CombatTurnPlayed'])
            expect(byCombat[1]).toEqual(entry({ characterId, combatId, occurredAt: later }))
        })

        it('annule les entrées si la transaction échoue', async () => {
            const ctx = getContext()
            const { characterId } = await ctx.createCharacterWithCombat()

            await expect(
                ctx.unitOfWork.run(async ({ journal }) => {
                    await journal.append(entry({ characterId }))
                    throw new Error('panne injectée')
                })
            ).rejects.toThrow('panne injectée')

            expect(await ctx.unitOfWork.run(({ journal }) => journal.findByCharacter(characterId))).toEqual([])
        })

        it('refuse un type vide', async () => {
            const ctx = getContext()
            const { characterId } = await ctx.createCharacterWithCombat()

            await expect(ctx.unitOfWork.run(({ journal }) => journal.append(entry({ characterId, type: ' ' })))).rejects.toThrow()
        })
    })
}
