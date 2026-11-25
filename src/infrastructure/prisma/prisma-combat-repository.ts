import { Combat } from '../../domain/combat/combat'
import { combatErrors } from '../../domain/combat/combat-errors'
import type { CombatRepository } from '../../domain/combat/combat-repository'
import { Combatant } from '../../domain/combat/combatant'
import type { Prisma } from '../../generated/prisma/client'
import { isUniqueViolation } from './prisma-errors'

const WITH_MONSTER = { monsterTemplate: { select: { name: true } } } as const

type CombatRow = Prisma.CombatGetPayload<{ include: typeof WITH_MONSTER }>

export function createPrismaCombatRepository(tx: Prisma.TransactionClient): CombatRepository {
    return {
        async findById(id) {
            const row = await tx.combat.findUnique({ where: { id }, include: WITH_MONSTER })
            return row ? toCombat(row) : undefined
        },

        async findByIdForUpdate(id) {
            // Verrou réel sur la ligne : une seconde action attend la fin de la première.
            const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM combats WHERE id = ${id}::uuid FOR UPDATE`
            if (locked.length === 0) return undefined
            const row = await tx.combat.findUnique({ where: { id }, include: WITH_MONSTER })
            return row ? toCombat(row) : undefined
        },

        async hasInProgressForCharacter(characterId) {
            return (await tx.combat.count({ where: { characterId, status: 'IN_PROGRESS' } })) > 0
        },

        async insert(combat) {
            const { character, monster } = combat
            try {
                const row = await tx.combat.create({
                    data: {
                        characterId: combat.characterId,
                        monsterTemplateId: combat.monsterTemplateId,
                        status: combat.status,
                        characterMaxHp: character.stats.maxHp,
                        characterHp: character.hp,
                        characterAttack: character.stats.attack,
                        characterDefense: character.stats.defense,
                        characterSpeed: character.stats.speed,
                        monsterMaxHp: monster.stats.maxHp,
                        monsterHp: monster.hp,
                        monsterAttack: monster.stats.attack,
                        monsterDefense: monster.stats.defense,
                        monsterSpeed: monster.stats.speed,
                        finishedAt: combat.finishedAt
                    },
                    include: WITH_MONSTER
                })
                return toCombat(row)
            } catch (error) {
                // Index unique partiel : dernier rempart si deux combats IN_PROGRESS arrivaient malgré le verrou.
                if (isUniqueViolation(error)) throw combatErrors.alreadyInCombat()
                throw error
            }
        },

        async save(combat) {
            const { id, status, character, monster, finishedAt } = combat.snapshot
            await tx.combat.update({
                where: { id },
                data: { status, characterHp: character.hp, monsterHp: monster.hp, finishedAt }
            })
        }
    }
}

function toCombat(row: CombatRow): Combat {
    return Combat.restore({
        id: row.id,
        characterId: row.characterId,
        monsterTemplateId: row.monsterTemplateId,
        monsterName: row.monsterTemplate.name,
        status: row.status,
        character: Combatant.of(
            {
                maxHp: row.characterMaxHp,
                attack: row.characterAttack,
                defense: row.characterDefense,
                speed: row.characterSpeed
            },
            row.characterHp
        ),
        monster: Combatant.of(
            { maxHp: row.monsterMaxHp, attack: row.monsterAttack, defense: row.monsterDefense, speed: row.monsterSpeed },
            row.monsterHp
        ),
        createdAt: row.createdAt,
        finishedAt: row.finishedAt
    })
}
