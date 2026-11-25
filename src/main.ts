import { createCheckHealth } from './application/health/check-health'
import { createAuthenticate } from './application/identity/authenticate'
import { createGetCurrentAccount } from './application/identity/get-current-account'
import { createLogin } from './application/identity/login'
import { createRegisterAccount } from './application/identity/register-account'
import { loadEnvironment } from './config/environment'
import { createLogger } from './infrastructure/logging/logger'
import { createPrismaClient } from './infrastructure/prisma/client'
import { createPrismaUnitOfWork } from './infrastructure/prisma/prisma-unit-of-work'
import { createArgon2PasswordHasher } from './infrastructure/security/argon2-password-hasher'
import { createCryptoTokenGenerator } from './infrastructure/security/crypto-token-generator'
import { createSystemClock } from './infrastructure/system/system-clock'
import { createApp } from './interfaces/http/app'

// Composition : seul fichier qui connaît toutes les implémentations.
function main(): void {
    const env = loadEnvironment()
    const logger = createLogger(env.LOG_LEVEL)

    const prisma = createPrismaClient(env.DATABASE_URL)
    const unitOfWork = createPrismaUnitOfWork(prisma)
    const passwordHasher = createArgon2PasswordHasher()
    const tokenGenerator = createCryptoTokenGenerator()
    const clock = createSystemClock()

    const app = createApp(
        {
            checkHealth: createCheckHealth(),
            registerAccount: createRegisterAccount({ unitOfWork, passwordHasher }),
            login: createLogin({ unitOfWork, passwordHasher, tokenGenerator, clock }),
            authenticate: createAuthenticate({ unitOfWork, tokenGenerator, clock }),
            getCurrentAccount: createGetCurrentAccount({ unitOfWork })
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

main()
