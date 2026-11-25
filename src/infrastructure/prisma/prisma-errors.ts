import { Prisma } from '../../generated/prisma/client'

/** Violation d'une contrainte d'unicité (P2002), par exemple deux inscriptions simultanées du même email. */
export function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
