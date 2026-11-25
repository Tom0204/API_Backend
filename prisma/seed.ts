// `npm run db:seed` : données de référence de rules.md, sur la base de DATABASE_URL. Idempotent.
import { createPrismaClient } from '../src/infrastructure/prisma/client'
import { seedReferenceData } from '../src/infrastructure/prisma/seed-reference-data'

try {
    process.loadEnvFile()
} catch {
    // .env absent : variables de l'environnement du processus
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
    throw new Error('DATABASE_URL manquant')
}

const prisma = createPrismaClient(databaseUrl)
try {
    await seedReferenceData(prisma)
    console.info('Données de référence à jour')
} finally {
    await prisma.$disconnect()
}
