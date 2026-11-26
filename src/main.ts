import { createCreateCharacter } from './contexts/characters/app/use-cases/create-character'
import { createGetCharacterStats } from './contexts/characters/app/use-cases/get-character-stats'
import { createGetMyCharacter } from './contexts/characters/app/use-cases/get-my-character'
import { createListClasses } from './contexts/characters/app/use-cases/list-classes'
import { createListMyCharacters } from './contexts/characters/app/use-cases/list-my-characters'
import { createGetMyCombat } from './contexts/combat/app/use-cases/get-my-combat'
import { createPlayCombatAction } from './contexts/combat/app/use-cases/play-combat-action'
import { createStartCombat } from './contexts/combat/app/use-cases/start-combat'
import { createCheckHealth } from './platform/health/check-health'
import { createListZoneMonsters } from './contexts/world/app/use-cases/list-zone-monsters'
import { createAuthenticate } from './contexts/identity/app/use-cases/authenticate'
import { createGetCurrentAccount } from './contexts/identity/app/use-cases/get-current-account'
import { createLogin } from './contexts/identity/app/use-cases/login'
import { createLogout } from './contexts/identity/app/use-cases/logout'
import { createLogoutAll } from './contexts/identity/app/use-cases/logout-all'
import { createRefreshSession } from './contexts/identity/app/use-cases/refresh-session'
import { createRegisterAccount } from './contexts/identity/app/use-cases/register-account'
import { createGetMyInventory } from './contexts/inventory/app/use-cases/get-my-inventory'
import { loadEnvironment } from './config/environment'
import { createLogger } from './platform/logging/logger'
import { createPrismaClient } from './platform/prisma/client'
import { findStartingZoneId } from './contexts/world/infra/find-starting-zone-id'
import { createEventHandlers } from './platform/events/event-handlers'
import { createPrismaUnitOfWork } from './platform/prisma/prisma-unit-of-work'
import { createArgon2PasswordHasher } from './contexts/identity/infra/argon2-password-hasher'
import { createCryptoTokenGenerator } from './contexts/identity/infra/crypto-token-generator'
import { createCryptoRandomSource } from './platform/system/crypto-random-source'
import { createSystemClock } from './platform/system/system-clock'
import { createApp } from './platform/http/app'

// Composition : seul fichier qui connaît toutes les implémentations.
async function main(): Promise<void> {
    const env = loadEnvironment()
    const logger = createLogger(env.LOG_LEVEL)

    const prisma = createPrismaClient(env.DATABASE_URL)
    const passwordHasher = createArgon2PasswordHasher()
    const tokenGenerator = createCryptoTokenGenerator()
    const clock = createSystemClock()
    const random = createCryptoRandomSource()
    const unitOfWork = createPrismaUnitOfWork(prisma, createEventHandlers({ random }))

    let startingZoneId: string
    try {
        startingZoneId = await findStartingZoneId(prisma)
    } catch (error) {
        logger.fatal({ err: error }, 'Startup failed')
        await prisma.$disconnect()
        process.exit(1)
    }

    const app = createApp(
        {
            checkHealth: createCheckHealth(),
            registerAccount: createRegisterAccount({ unitOfWork, passwordHasher }),
            login: createLogin({ unitOfWork, passwordHasher, tokenGenerator, clock }),
            refreshSession: createRefreshSession({ unitOfWork, tokenGenerator, clock }),
            logout: createLogout({ unitOfWork, clock }),
            logoutAll: createLogoutAll({ unitOfWork, clock }),
            authenticate: createAuthenticate({ unitOfWork, tokenGenerator, clock }),
            getCurrentAccount: createGetCurrentAccount({ unitOfWork }),
            listClasses: createListClasses({ unitOfWork }),
            createCharacter: createCreateCharacter({ unitOfWork, startingZoneId, clock }),
            listMyCharacters: createListMyCharacters({ unitOfWork }),
            getMyCharacter: createGetMyCharacter({ unitOfWork }),
            getCharacterStats: createGetCharacterStats({ unitOfWork }),
            listZoneMonsters: createListZoneMonsters({ unitOfWork }),
            startCombat: createStartCombat({ unitOfWork, clock }),
            playCombatAction: createPlayCombatAction({ unitOfWork, clock }),
            getMyCombat: createGetMyCombat({ unitOfWork }),
            getMyInventory: createGetMyInventory({ unitOfWork })
        },
        { logger, corsOrigins: env.CORS_ORIGINS }
    )

    const server = app.listen(env.PORT, () => {
        logger.info({ port: env.PORT }, 'API listening')
    })
    // Port occupé ou refusé : message clair et arrêt, plutôt qu'une exception brute.
    server.on('error', (error) => {
        logger.fatal({ err: error }, 'HTTP server error')
        process.exit(1)
    })

    const shutdown = () => {
        server.close(() => {
            prisma.$disconnect().finally(() => process.exit(0))
        })
        server.closeIdleConnections() // n'attend pas les connexions keep-alive inactives
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
}

// Erreur avant la création du logger (variables d'environnement) : message seul, jamais de valeur.
main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Startup failed')
    process.exit(1)
})
