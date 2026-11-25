import { Writable } from 'node:stream'
import { pino } from 'pino'
import { createCreateCharacter } from '../../src/application/characters/create-character'
import { createGetCharacterStats } from '../../src/application/characters/get-character-stats'
import { createGetMyCharacter } from '../../src/application/characters/get-my-character'
import { createListClasses } from '../../src/application/characters/list-classes'
import { createListMyCharacters } from '../../src/application/characters/list-my-characters'
import { createCheckHealth } from '../../src/application/health/check-health'
import { createAuthenticate } from '../../src/application/identity/authenticate'
import { createGetCurrentAccount } from '../../src/application/identity/get-current-account'
import { createLogin } from '../../src/application/identity/login'
import { createRegisterAccount } from '../../src/application/identity/register-account'
import { type AppOptions, createApp } from '../../src/interfaces/http/app'
import { FakePasswordHasher, FakeTokenGenerator, FixedClock } from './fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from './in-memory-unit-of-work'

/** Application HTTP complète sur les faux : jamais `main.ts`, jamais de base. */
export function buildTestApp(overrides: Partial<Omit<AppOptions, 'logger'>> = {}) {
    const database = new InMemoryDatabase()
    const passwordHasher = new FakePasswordHasher()
    const tokenGenerator = new FakeTokenGenerator()
    const clock = new FixedClock()

    const logLines: string[] = []
    const logger = pino(
        { level: 'info' },
        new Writable({
            write(chunk: Buffer, _encoding, callback) {
                logLines.push(chunk.toString())
                callback()
            }
        })
    )

    const deps = { unitOfWork: database, passwordHasher, tokenGenerator, clock }
    const app = createApp(
        {
            checkHealth: createCheckHealth(),
            registerAccount: createRegisterAccount(deps),
            login: createLogin(deps),
            authenticate: createAuthenticate(deps),
            getCurrentAccount: createGetCurrentAccount(deps),
            listClasses: createListClasses(deps),
            createCharacter: createCreateCharacter({ ...deps, startingZoneId: IN_MEMORY_STARTING_ZONE_ID }),
            listMyCharacters: createListMyCharacters(deps),
            getMyCharacter: createGetMyCharacter(deps),
            getCharacterStats: createGetCharacterStats(deps)
        },
        { logger, corsOrigins: [], ...overrides }
    )

    return { app, database, passwordHasher, tokenGenerator, clock, logLines }
}

export const VALID_PASSWORD = 'correct-horse-battery-staple'
