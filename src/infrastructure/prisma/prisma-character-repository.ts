import { Character } from '../../domain/characters/character'
import { characterErrors } from '../../domain/characters/character-errors'
import { CharacterName } from '../../domain/characters/character-name'
import type { CharacterRepository } from '../../domain/characters/character-repository'
import { Progression } from '../../domain/characters/progression'
import type { Prisma } from '../../generated/prisma/client'
import { isUniqueViolation } from './prisma-errors'

type CharacterRow = Prisma.CharacterGetPayload<object>

export function createPrismaCharacterRepository(tx: Prisma.TransactionClient): CharacterRepository {
    return {
        async findById(id) {
            const row = await tx.character.findUnique({ where: { id } })
            return row ? toCharacter(row) : undefined
        },

        async findByIdForUpdate(id) {
            // Verrou réel sur la ligne, puis reconstruction de l'agrégat.
            const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM characters WHERE id = ${id}::uuid FOR UPDATE`
            if (locked.length === 0) return undefined
            const row = await tx.character.findUnique({ where: { id } })
            return row ? toCharacter(row) : undefined
        },

        async findByAccount(accountId) {
            const rows = await tx.character.findMany({ where: { accountId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
            return rows.map(toCharacter)
        },

        async countByAccountForUpdate(accountId) {
            // Verrou réel : la seconde transaction attend que la première soit validée, puis compte à nouveau.
            await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`
            return tx.character.count({ where: { accountId } })
        },

        async isNameTaken(normalizedName) {
            // Même expression que l'index unique characters_name_lower_key.
            const [row] = await tx.$queryRaw<{ taken: boolean }[]>`
                SELECT EXISTS (SELECT 1 FROM characters WHERE lower(name) = ${normalizedName}) AS taken`
            return row?.taken === true
        },

        async insert(character) {
            try {
                const row = await tx.character.create({
                    data: {
                        accountId: character.accountId,
                        classId: character.classId,
                        zoneId: character.zoneId,
                        name: character.name.value,
                        level: character.progression.level,
                        experience: character.progression.experience
                    }
                })
                return toCharacter(row)
            } catch (error) {
                // Deux comptes, même nom en même temps : l'index lower(name) refuse le second.
                if (isUniqueViolation(error)) throw characterErrors.nameTaken()
                throw error
            }
        }
    }
}

function toCharacter(row: CharacterRow): Character {
    return Character.restore({
        id: row.id,
        accountId: row.accountId,
        classId: row.classId,
        zoneId: row.zoneId,
        name: CharacterName.create(row.name),
        progression: Progression.of(row.level, row.experience),
        createdAt: row.createdAt
    })
}
