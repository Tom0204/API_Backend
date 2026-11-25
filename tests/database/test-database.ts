import { createPrismaClient, type PrismaClient } from '../../src/infrastructure/prisma/client'

const TEST_DATABASE_NAME = 'mmorpg_test'

/**
 * Garde de la base de test : `NODE_ENV=test` et `TEST_DATABASE_URL` visant exactement `mmorpg_test`.
 * Les messages ne citent jamais l'URL (elle contient le mot de passe).
 */
export function requireTestDatabaseUrl(): string {
    try {
        process.loadEnvFile()
    } catch {
        // .env absent : variables de l'environnement du processus
    }

    if (process.env.NODE_ENV !== 'test') {
        throw new Error('Tests PostgreSQL refusés : NODE_ENV doit valoir "test"')
    }
    const url = process.env.TEST_DATABASE_URL
    if (!url) {
        throw new Error('Tests PostgreSQL refusés : TEST_DATABASE_URL manquant')
    }
    if (new URL(url).pathname !== `/${TEST_DATABASE_NAME}`) {
        throw new Error(`Tests PostgreSQL refusés : TEST_DATABASE_URL doit viser la base ${TEST_DATABASE_NAME}`)
    }
    return url
}

/** Client sur la base de test, après vérification de `current_database()` côté serveur. */
export async function connectTestDatabase(): Promise<PrismaClient> {
    const prisma = createPrismaClient(requireTestDatabaseUrl())
    const [row] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    if (row?.current_database !== TEST_DATABASE_NAME) {
        await prisma.$disconnect()
        throw new Error(`Tests PostgreSQL refusés : la base connectée n'est pas ${TEST_DATABASE_NAME}`)
    }
    return prisma
}

/** Domaine des emails créés par les tests PostgreSQL : seuls ces comptes sont supprimés au nettoyage. */
export const TEST_EMAIL_DOMAIN = '@db.l1.example.com'

export async function deleteTestAccounts(prisma: PrismaClient): Promise<void> {
    await prisma.account.deleteMany({ where: { email: { endsWith: TEST_EMAIL_DOMAIN } } })
}
