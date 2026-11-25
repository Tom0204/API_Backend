import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

/** Client Prisma 7 sur le pilote `pg`. L'URL n'est jamais journalisée. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
}

export type { PrismaClient }
export type { Prisma } from '../../generated/prisma/client'
