import { MonsterTemplate } from '../domain/monster-template'
import type { WorldRepository } from '../app/interfaces/world-repository'
import { Zone } from '../domain/zone'
import type { Prisma } from '../../../generated/prisma/client'

const WITH_LOOT = { lootItem: { select: { id: true, code: true, name: true } } } as const

type MonsterRow = Prisma.MonsterTemplateGetPayload<{ include: typeof WITH_LOOT }>

export function createPrismaWorldRepository(tx: Prisma.TransactionClient): WorldRepository {
    return {
        async findZoneById(id) {
            const row = await tx.zone.findUnique({ where: { id } })
            return row ? Zone.restore(row) : undefined
        },

        async findMonstersByZone(zoneId) {
            const rows = await tx.monsterTemplate.findMany({ where: { zoneId }, orderBy: [{ level: 'asc' }, { id: 'asc' }], include: WITH_LOOT })
            return rows.map(toMonsterTemplate)
        },

        async findMonsterById(id) {
            const row = await tx.monsterTemplate.findUnique({ where: { id }, include: WITH_LOOT })
            return row ? toMonsterTemplate(row) : undefined
        }
    }
}

function toMonsterTemplate(row: MonsterRow): MonsterTemplate {
    return MonsterTemplate.restore({
        id: row.id,
        code: row.code,
        zoneId: row.zoneId,
        name: row.name,
        level: row.level,
        hp: row.hp,
        attack: row.attack,
        defense: row.defense,
        speed: row.speed,
        xpReward: row.xpReward,
        loot: row.lootItem && row.lootChance !== null ? { item: row.lootItem, chance: row.lootChance } : null
    })
}
