import { defineConfig } from 'prisma/config'

// Prisma 7 ne charge plus .env : chargement natif de Node (pas de dotenv), s'il existe.
try {
    process.loadEnvFile()
} catch {
    // .env absent : les variables viennent de l'environnement du processus.
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'tsx prisma/seed.ts'
    },
    // `generate` n'a pas besoin de la base ; migrate et seed échouent clairement si l'URL manque.
    datasource: { url: process.env.DATABASE_URL ?? '' }
})
