import { describe, expect, it } from 'vitest'
import type { AppTransaction } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'
import type { InventoryItem } from '../../src/contexts/inventory/domain/item-stack'

export interface InventoryContractContext {
    unitOfWork: UnitOfWork<AppTransaction>
    /** Crée un compte et un personnage propres au test ; renvoie l'identifiant du personnage. */
    createCharacter(): Promise<string>
    /** Objets du seed, par code. */
    items: { pelt: InventoryItem; tusk: InventoryItem }
}

/** Même contrat pour les repositories en mémoire et Prisma (AGENTS.md §6). */
export function describeInventoryRepositoryContract(name: string, getContext: () => InventoryContractContext) {
    describe(`contrat du repository inventories — ${name}`, () => {
        const addAndSave = (ctx: InventoryContractContext, characterId: string, additions: [InventoryItem, number][]) =>
            ctx.unitOfWork.run(async ({ inventories }) => {
                const inventory = await inventories.findByCharacter(characterId)
                for (const [item, quantity] of additions) inventory.add(item, quantity)
                await inventories.save(inventory)
            })
        const read = (ctx: InventoryContractContext, characterId: string) =>
            ctx.unitOfWork.run(async ({ inventories }) =>
                (await inventories.findByCharacter(characterId)).items.map(({ item, quantity }) => ({ ...item, quantity }))
            )

        it('personnage sans objet : inventaire vide (écart CHAR-02)', async () => {
            const ctx = getContext()
            const characterId = await ctx.createCharacter()

            expect(await read(ctx, characterId)).toEqual([])
        })

        it('enregistre les ajouts par incrément, empile par objet et trie par nom', async () => {
            const ctx = getContext()
            const characterId = await ctx.createCharacter()

            await addAndSave(ctx, characterId, [[ctx.items.pelt, 1]])
            await addAndSave(ctx, characterId, [
                [ctx.items.pelt, 1],
                [ctx.items.tusk, 1],
                [ctx.items.pelt, 1]
            ])

            expect(await read(ctx, characterId)).toEqual([
                { ...ctx.items.tusk, quantity: 1 },
                { ...ctx.items.pelt, quantity: 3 }
            ])
        })

        it('isole les inventaires des personnages', async () => {
            const ctx = getContext()
            const alice = await ctx.createCharacter()
            const bob = await ctx.createCharacter()

            await addAndSave(ctx, alice, [[ctx.items.pelt, 1]])

            expect(await read(ctx, bob)).toEqual([])
            expect(await read(ctx, alice)).toEqual([{ ...ctx.items.pelt, quantity: 1 }])
        })

        it('annule les ajouts si la transaction échoue', async () => {
            const ctx = getContext()
            const characterId = await ctx.createCharacter()

            await expect(
                ctx.unitOfWork.run(async ({ inventories }) => {
                    const inventory = await inventories.findByCharacter(characterId)
                    inventory.add(ctx.items.pelt, 1)
                    await inventories.save(inventory)
                    throw new Error('panne injectée')
                })
            ).rejects.toThrow('panne injectée')

            expect(await read(ctx, characterId)).toEqual([])
        })
    })
}
