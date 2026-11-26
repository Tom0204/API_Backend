import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AppTransaction } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'
import { Character } from '../../src/contexts/characters/domain/character'
import { CharacterName } from '../../src/contexts/characters/domain/character-name'

export interface CharacterContractContext {
    unitOfWork: UnitOfWork<AppTransaction>
    /** Crée un compte propre au test et renvoie son identifiant. */
    createAccount(): Promise<string>
    warriorClassId: string
    startingZoneId: string
}

/** Nom de personnage unique (lettres seules, rules.md §4). */
export function uniqueCharacterName(): string {
    const letters = randomUUID().replace(/[^a-f]/g, '').slice(0, 12)
    return `Zz${letters}`.padEnd(8, 'q')
}

/** Même contrat pour les repositories en mémoire et Prisma (AGENTS.md §6). */
export function describeCharacterRepositoryContract(name: string, getContext: () => CharacterContractContext) {
    describe(`contrat des repositories characters — ${name}`, () => {
        const newCharacter = (ctx: CharacterContractContext, accountId: string, rawName = uniqueCharacterName()) =>
            Character.create({
                accountId,
                classId: ctx.warriorClassId,
                startingZoneId: ctx.startingZoneId,
                name: CharacterName.create(rawName)
            })

        it('liste les classes triées par nom et retrouve une classe par identifiant', async () => {
            const ctx = getContext()

            const classes = await ctx.unitOfWork.run(({ classes }) => classes.findAll())
            const warrior = await ctx.unitOfWork.run(({ classes }) => classes.findById(ctx.warriorClassId))

            expect(classes.map((c) => c.snapshot.name)).toEqual(['Guerrier', 'Mage', 'Voleur'])
            expect(warrior?.snapshot).toMatchObject({ code: 'warrior', base: { hp: 120 }, perLevel: { hp: 12 } })
            expect(await ctx.unitOfWork.run(({ classes }) => classes.findById(randomUUID()))).toBeUndefined()
        })

        it('insère un personnage puis le retrouve par identifiant et par compte', async () => {
            const ctx = getContext()
            const accountId = await ctx.createAccount()

            const inserted = await ctx.unitOfWork.run(({ characters }) => characters.insert(newCharacter(ctx, accountId)))
            const byId = await ctx.unitOfWork.run(({ characters }) => characters.findById(inserted.id))
            const byAccount = await ctx.unitOfWork.run(({ characters }) => characters.findByAccount(accountId))

            expect(inserted.snapshot.progression).toMatchObject({ level: 1, experience: 0 })
            expect(inserted.snapshot.createdAt).toBeInstanceOf(Date)
            expect(byId?.snapshot).toEqual(inserted.snapshot)
            expect(byAccount.map((c) => c.id)).toEqual([inserted.id])
            expect(await ctx.unitOfWork.run(({ characters }) => characters.findById(randomUUID()))).toBeUndefined()
        })

        it('compte les personnages du compte et détecte un nom pris sans tenir compte de la casse', async () => {
            const ctx = getContext()
            const accountId = await ctx.createAccount()
            const rawName = uniqueCharacterName()

            await ctx.unitOfWork.run(({ characters }) => characters.insert(newCharacter(ctx, accountId, rawName)))

            expect(await ctx.unitOfWork.run(({ characters }) => characters.countByAccountForUpdate(accountId))).toBe(1)
            expect(await ctx.unitOfWork.run(({ characters }) => characters.isNameTaken(rawName.toLowerCase()))).toBe(true)
            expect(await ctx.unitOfWork.run(({ characters }) => characters.isNameTaken(uniqueCharacterName().toLowerCase()))).toBe(
                false
            )
        })

        it('enregistre niveau et XP après un gain (verrou sur le personnage)', async () => {
            const ctx = getContext()
            const accountId = await ctx.createAccount()
            const inserted = await ctx.unitOfWork.run(({ characters }) => characters.insert(newCharacter(ctx, accountId)))

            await ctx.unitOfWork.run(async ({ characters }) => {
                const character = await characters.findByIdForUpdate(inserted.id)
                if (!character) throw new Error('personnage absent')
                character.gainExperience(390, new Date()) // rules.md §5 : 390 XP depuis le niveau 1 → niveau 3 avec 7 XP
                await characters.save(character)
            })
            const saved = await ctx.unitOfWork.run(({ characters }) => characters.findById(inserted.id))

            expect(saved?.snapshot.progression).toMatchObject({ level: 3, experience: 7 })
        })

        it('insertion d’un nom déjà pris (autre casse) → CHARACTER_NAME_TAKEN', async () => {
            const ctx = getContext()
            const accountId = await ctx.createAccount()
            const rawName = uniqueCharacterName()
            await ctx.unitOfWork.run(({ characters }) => characters.insert(newCharacter(ctx, accountId, rawName)))

            await expect(
                ctx.unitOfWork.run(({ characters }) => characters.insert(newCharacter(ctx, accountId, rawName.toUpperCase())))
            ).rejects.toMatchObject({ code: 'CHARACTER_NAME_TAKEN', kind: 'CONFLICT' })
        })
    })
}
