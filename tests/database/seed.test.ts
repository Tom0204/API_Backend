import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/infrastructure/prisma/client'
import { seedReferenceData } from '../../src/infrastructure/prisma/seed-reference-data'
import { connectTestDatabase } from './test-database'

describe('seed des données de référence', () => {
    let prisma: PrismaClient

    beforeAll(async () => {
        prisma = await connectTestDatabase()
    })

    afterAll(async () => {
        await prisma.$disconnect()
    })

    it('lancé deux fois : aucun doublon, mêmes identifiants', async () => {
        await seedReferenceData(prisma)
        const firstIds = (await prisma.monsterTemplate.findMany({ orderBy: { code: 'asc' } })).map((m) => m.id)

        await seedReferenceData(prisma)
        const secondIds = (await prisma.monsterTemplate.findMany({ orderBy: { code: 'asc' } })).map((m) => m.id)

        expect(await prisma.characterClass.count()).toBe(3)
        expect(await prisma.zone.count()).toBe(1)
        expect(await prisma.item.count()).toBe(3)
        expect(secondIds).toEqual(firstIds)
        expect(secondIds).toHaveLength(3)
    })

    it('classes conformes à rules.md §3', async () => {
        const classes = await prisma.characterClass.findMany({ orderBy: { code: 'asc' } })

        expect(
            classes.map((c) => [
                c.code,
                c.name,
                [c.baseHp, c.baseMana, c.baseAttack, c.baseDefense, c.baseSpeed],
                [c.hpPerLevel, c.manaPerLevel, c.attackPerLevel, c.defensePerLevel, c.speedPerLevel]
            ])
        ).toEqual([
            ['mage', 'Mage', [80, 100, 10, 4, 10], [8, 10, 2, 1, 1]],
            ['rogue', 'Voleur', [95, 40, 11, 6, 14], [10, 4, 2, 1, 2]],
            ['warrior', 'Guerrier', [120, 20, 12, 8, 8], [12, 2, 2, 2, 1]]
        ])
    })

    it('Clairière et ses 3 monstres conformes à rules.md §8', async () => {
        const zone = await prisma.zone.findUniqueOrThrow({
            where: { code: 'clearing' },
            include: { monsters: { include: { lootItem: true }, orderBy: { level: 'asc' } } }
        })

        expect([zone.name, zone.minLevel, zone.maxLevel]).toEqual(['Clairière', 1, 3])
        expect(
            zone.monsters.map((m) => [m.name, m.level, m.hp, m.attack, m.defense, m.speed, m.xpReward, m.lootItem?.name, m.lootChance])
        ).toEqual([
            ['Loup', 1, 40, 8, 2, 9, 25, 'Peau de loup', 0.5],
            ['Sanglier', 2, 60, 10, 5, 6, 40, 'Défense de sanglier', 0.4],
            ['Bandit', 3, 75, 12, 6, 11, 60, 'Insigne de bandit', 0.25]
        ])
    })
})
