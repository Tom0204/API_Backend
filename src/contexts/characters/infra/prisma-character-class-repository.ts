import { CharacterClass } from '../domain/character-class'
import type { CharacterClassRepository } from '../app/interfaces/character-class-repository'
import type { Prisma } from '../../../generated/prisma/client'

type CharacterClassRow = Prisma.CharacterClassGetPayload<object>

export function createPrismaCharacterClassRepository(tx: Prisma.TransactionClient): CharacterClassRepository {
    return {
        async findById(id) {
            const row = await tx.characterClass.findUnique({ where: { id } })
            return row ? toCharacterClass(row) : undefined
        },

        async findAll() {
            const rows = await tx.characterClass.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] })
            return rows.map(toCharacterClass)
        }
    }
}

function toCharacterClass(row: CharacterClassRow): CharacterClass {
    return CharacterClass.restore({
        id: row.id,
        code: row.code,
        name: row.name,
        base: { hp: row.baseHp, mana: row.baseMana, attack: row.baseAttack, defense: row.baseDefense, speed: row.baseSpeed },
        perLevel: {
            hp: row.hpPerLevel,
            mana: row.manaPerLevel,
            attack: row.attackPerLevel,
            defense: row.defensePerLevel,
            speed: row.speedPerLevel
        }
    })
}
