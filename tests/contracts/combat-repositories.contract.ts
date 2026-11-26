import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AppTransaction } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'
import { Combat } from '../../src/contexts/combat/domain/combat'

export interface CombatContractContext {
    unitOfWork: UnitOfWork<AppTransaction>
    /** Crée un compte et un personnage propres au test ; renvoie l'identifiant du personnage. */
    createCharacter(): Promise<string>
    startingZoneId: string
    wolfId: string
}

const WARRIOR_L1 = { maxHp: 120, attack: 12, defense: 8, speed: 8 }
const WOLF = { maxHp: 40, attack: 8, defense: 2, speed: 9 }

/** Même contrat pour les repositories en mémoire et Prisma (AGENTS.md §6). */
export function describeCombatRepositoryContract(name: string, getContext: () => CombatContractContext) {
    const newCombat = (ctx: CombatContractContext, characterId: string) =>
        Combat.start({
            characterId,
            monsterTemplateId: ctx.wolfId,
            monsterName: 'Loup',
            character: WARRIOR_L1,
            monster: WOLF,
            now: new Date()
        }).combat

    describe(`contrat des repositories world et combats — ${name}`, () => {
        it('lit la zone de départ et ses monstres triés par niveau', async () => {
            const ctx = getContext()

            const zone = await ctx.unitOfWork.run(({ world }) => world.findZoneById(ctx.startingZoneId))
            const monsters = await ctx.unitOfWork.run(({ world }) => world.findMonstersByZone(ctx.startingZoneId))
            const wolf = await ctx.unitOfWork.run(({ world }) => world.findMonsterById(ctx.wolfId))

            expect(zone?.snapshot).toMatchObject({ code: 'clearing', name: 'Clairière', minLevel: 1, maxLevel: 3 })
            expect(monsters.map((m) => m.snapshot.code)).toEqual(['wolf', 'boar', 'bandit'])
            expect(wolf?.snapshot).toMatchObject({ hp: WOLF.maxHp, attack: WOLF.attack, defense: WOLF.defense, speed: WOLF.speed })
            expect(wolf?.snapshot.loot).toEqual({ item: { id: expect.any(String), code: 'wolf-pelt', name: 'Peau de loup' }, chance: 0.5 })
            expect(monsters.map((m) => m.snapshot.loot?.item.code)).toEqual(['wolf-pelt', 'boar-tusk', 'bandit-badge'])
            expect(await ctx.unitOfWork.run(({ world }) => world.findZoneById(randomUUID()))).toBeUndefined()
            expect(await ctx.unitOfWork.run(({ world }) => world.findMonstersByZone(randomUUID()))).toEqual([])
            expect(await ctx.unitOfWork.run(({ world }) => world.findMonsterById(randomUUID()))).toBeUndefined()
        })

        it('insère un combat, le relit (avec et sans verrou) et détecte le combat en cours', async () => {
            const ctx = getContext()
            const characterId = await ctx.createCharacter()

            const inserted = await ctx.unitOfWork.run(({ combats }) => combats.insert(newCombat(ctx, characterId)))
            const byId = await ctx.unitOfWork.run(({ combats }) => combats.findById(inserted.id))
            const locked = await ctx.unitOfWork.run(({ combats }) => combats.findByIdForUpdate(inserted.id))

            expect(inserted.snapshot).toMatchObject({ status: 'IN_PROGRESS', monsterName: 'Loup', finishedAt: null })
            expect(inserted.snapshot.character.hp).toBe(113)
            expect(byId?.snapshot).toEqual(inserted.snapshot)
            expect(locked?.snapshot).toEqual(inserted.snapshot)
            expect(await ctx.unitOfWork.run(({ combats }) => combats.hasInProgressForCharacter(characterId))).toBe(true)
            expect(await ctx.unitOfWork.run(({ combats }) => combats.findByIdForUpdate(randomUUID()))).toBeUndefined()
        })

        it('enregistre PV, statut et date de fin ; un combat terminé libère le personnage', async () => {
            const ctx = getContext()
            const characterId = await ctx.createCharacter()
            const inserted = await ctx.unitOfWork.run(({ combats }) => combats.insert(newCombat(ctx, characterId)))
            const finishedAt = new Date('2026-11-26T10:00:00.000Z')

            await ctx.unitOfWork.run(async ({ combats }) => {
                const combat = await combats.findByIdForUpdate(inserted.id)
                if (!combat) throw new Error('combat absent')
                while (!combat.isFinished) combat.attack(finishedAt)
                await combats.save(combat)
            })
            const saved = await ctx.unitOfWork.run(({ combats }) => combats.findById(inserted.id))

            expect(saved?.snapshot).toMatchObject({ status: 'VICTORY', finishedAt })
            expect(saved?.snapshot.character.hp).toBe(92)
            expect(saved?.snapshot.monster.hp).toBe(0)
            expect(await ctx.unitOfWork.run(({ combats }) => combats.hasInProgressForCharacter(characterId))).toBe(false)
        })

        it('refuse un second combat IN_PROGRESS pour le même personnage → CHARACTER_ALREADY_IN_COMBAT', async () => {
            const ctx = getContext()
            const characterId = await ctx.createCharacter()
            await ctx.unitOfWork.run(({ combats }) => combats.insert(newCombat(ctx, characterId)))

            await expect(
                ctx.unitOfWork.run(({ combats }) => combats.insert(newCombat(ctx, characterId)))
            ).rejects.toMatchObject({ code: 'CHARACTER_ALREADY_IN_COMBAT', kind: 'CONFLICT' })
        })
    })
}
