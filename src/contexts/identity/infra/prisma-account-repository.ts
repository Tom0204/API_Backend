import { Account } from '../domain/account'
import type { AccountRepository } from '../app/interfaces/account-repository'
import { Email } from '../domain/email'
import { identityErrors } from '../domain/identity-errors'
import { Permissions } from '../domain/permissions'
import type { Prisma } from '../../../generated/prisma/client'
import { isUniqueViolation } from '../../../platform/prisma/prisma-errors'

type AccountRow = {
    id: string
    email: string
    passwordHash: string
    failedLoginCount: number
    lockedUntil: Date | null
    permissions: number
    suspendedAt: Date | null
    createdAt: Date
}

export function createPrismaAccountRepository(tx: Prisma.TransactionClient): AccountRepository {
    return {
        async findById(id) {
            const row = await tx.account.findUnique({ where: { id } })
            return row ? toAccount(row) : undefined
        },

        async findByIdForUpdate(id) {
            await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${id}::uuid FOR UPDATE`
            const row = await tx.account.findUnique({ where: { id } })
            return row ? toAccount(row) : undefined
        },

        async findByEmail(email) {
            const row = await tx.account.findUnique({ where: { email: email.value } })
            return row ? toAccount(row) : undefined
        },

        async list() {
            const rows = await tx.account.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
            return rows.map(toAccount)
        },

        async insert(account) {
            try {
                const row = await tx.account.create({
                    data: {
                        email: account.email.value,
                        passwordHash: account.passwordHash,
                        permissions: account.permissions.mask
                    }
                })
                return toAccount(row)
            } catch (error) {
                // En concurrence, la seconde inscription attend la première puis viole l'index unique.
                if (isUniqueViolation(error)) throw identityErrors.emailAlreadyUsed()
                throw error
            }
        },

        async save(account) {
            const { id, failedLoginCount, lockedUntil, permissions, suspendedAt } = account.snapshot
            await tx.account.update({
                where: { id },
                data: { failedLoginCount, lockedUntil, permissions: permissions.mask, suspendedAt }
            })
        }
    }
}

function toAccount(row: AccountRow): Account {
    return Account.restore({
        id: row.id,
        email: Email.create(row.email),
        passwordHash: row.passwordHash,
        failedLoginCount: row.failedLoginCount,
        lockedUntil: row.lockedUntil,
        permissions: Permissions.fromMask(row.permissions),
        suspendedAt: row.suspendedAt,
        createdAt: row.createdAt
    })
}
