import { Writable } from 'node:stream'
import { pino } from 'pino'
import { createCreateCharacter } from '../../src/application/characters/create-character'
import { createGetCharacterStats } from '../../src/application/characters/get-character-stats'
import { createGetMyCharacter } from '../../src/application/characters/get-my-character'
import { createListClasses } from '../../src/application/characters/list-classes'
import { createListMyCharacters } from '../../src/application/characters/list-my-characters'
import { createGetMyCombat } from '../../src/application/combat/get-my-combat'
import { createPlayCombatAction } from '../../src/application/combat/play-combat-action'
import { createStartCombat } from '../../src/application/combat/start-combat'
import { createCheckHealth } from '../../src/application/health/check-health'
import { createListZoneMonsters } from '../../src/application/world/list-zone-monsters'
import { createAuthenticate } from '../../src/application/identity/authenticate'
import { createGetCurrentAccount } from '../../src/application/identity/get-current-account'
import { createLogin } from '../../src/application/identity/login'
import { createRegisterAccount } from '../../src/application/identity/register-account'
import { createGetMyInventory } from '../../src/application/inventory/get-my-inventory'
import { type AppOptions, createApp } from '../../src/interfaces/http/app'
import { FakePasswordHasher, FakeTokenGenerator, FixedClock, FixedRandom } from './fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from './in-memory-unit-of-work'

/** Application HTTP complète sur les faux : jamais `main.ts`, jamais de base. */
export function buildTestApp(overrides: Partial<Omit<AppOptions, 'logger'>> = {}) {
    const database = new InMemoryDatabase()
    const passwordHasher = new FakePasswordHasher()
    const tokenGenerator = new FakeTokenGenerator()
    const clock = new FixedClock()
    const random = new FixedRandom() // 0,9 par défaut : aucun butin ; modifiable par les tests

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

    const deps = { unitOfWork: database, passwordHasher, tokenGenerator, clock, random }
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
            getCharacterStats: createGetCharacterStats(deps),
            listZoneMonsters: createListZoneMonsters(deps),
            startCombat: createStartCombat(deps),
            playCombatAction: createPlayCombatAction(deps),
            getMyCombat: createGetMyCombat(deps),
            getMyInventory: createGetMyInventory(deps)
        },
        { logger, corsOrigins: [], ...overrides }
    )

    return { app, database, passwordHasher, tokenGenerator, clock, random, logLines }
}

export const VALID_PASSWORD = 'correct-horse-battery-staple'
