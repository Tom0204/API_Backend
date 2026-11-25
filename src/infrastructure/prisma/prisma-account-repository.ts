import { Account } from '../../domain/identity/account'
import type { AccountRepository } from '../../domain/identity/account-repository'
import { Email } from '../../domain/identity/email'
import { identityErrors } from '../../domain/identity/identity-errors'
import type { Prisma } from '../../generated/prisma/client'
import { isUniqueViolation } from './prisma-errors'

type AccountRow = { id: string; email: string; passwordHash: string; createdAt: Date }

export function createPrismaAccountRepository(tx: Prisma.TransactionClient): AccountRepository {
    return {
        async findById(id) {
            const row = await tx.account.findUnique({ where: { id } })
            return row ? toAccount(row) : undefined
        },

        async findByEmail(email) {
            const row = await tx.account.findUnique({ where: { email: email.value } })
            return row ? toAccount(row) : undefined
        },

        async insert(account) {
            try {
                const row = await tx.account.create({
                    data: { email: account.email.value, passwordHash: account.passwordHash }
                })
                return toAccount(row)
            } catch (error) {
                // En concurrence, la seconde inscription attend la première puis viole l'index unique.
                if (isUniqueViolation(error)) throw identityErrors.emailAlreadyUsed()
                throw error
            }
        }
    }
}

function toAccount(row: AccountRow): Account {
    return Account.restore({
        id: row.id,
        email: Email.create(row.email),
        passwordHash: row.passwordHash,
        createdAt: row.createdAt
    })
}
