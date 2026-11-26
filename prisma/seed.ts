// `npm run db:seed` : données de référence de rules.md, puis premier administrateur (ROLE-01), sur la base de
// DATABASE_URL. Idempotent.
import { createArgon2PasswordHasher } from '../src/contexts/identity/infra/argon2-password-hasher'
import { createPrismaClient } from '../src/platform/prisma/client'
import { readAdminSeedConfig, seedAdminAccount } from '../src/platform/prisma/seed-admin'
import { seedReferenceData } from '../src/platform/prisma/seed-reference-data'

try {
    process.loadEnvFile()
} catch {
    // .env absent : variables de l'environnement du processus
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
    throw new Error('DATABASE_URL manquant')
}
// Lu avant toute écriture : une configuration invalide n'applique rien.
const adminConfig = readAdminSeedConfig(process.env)

const prisma = createPrismaClient(databaseUrl)
try {
    await seedReferenceData(prisma)
    console.info('Données de référence à jour')

    if (adminConfig) {
        const result = await seedAdminAccount(prisma, adminConfig, createArgon2PasswordHasher())
        console.info(result === 'created' ? 'Administrateur créé' : 'Administrateur déjà présent : inchangé')
    } else {
        console.info('ADMIN_EMAIL et ADMIN_PASSWORD absents : aucun administrateur créé')
    }
} finally {
    await prisma.$disconnect()
}
