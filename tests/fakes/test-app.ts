import { Writable } from 'node:stream'
import { pino } from 'pino'
import { createCreateCharacter } from '../../src/contexts/characters/app/use-cases/create-character'
import { createGetCharacterStats } from '../../src/contexts/characters/app/use-cases/get-character-stats'
import { createGetMyCharacter } from '../../src/contexts/characters/app/use-cases/get-my-character'
import { createListClasses } from '../../src/contexts/characters/app/use-cases/list-classes'
import { createListMyCharacters } from '../../src/contexts/characters/app/use-cases/list-my-characters'
import { createGetMyCombat } from '../../src/contexts/combat/app/use-cases/get-my-combat'
import { createPlayCombatAction } from '../../src/contexts/combat/app/use-cases/play-combat-action'
import { createStartCombat } from '../../src/contexts/combat/app/use-cases/start-combat'
import { createCheckHealth } from '../../src/platform/health/check-health'
import { createListZoneMonsters } from '../../src/contexts/world/app/use-cases/list-zone-monsters'
import { createAuthenticate } from '../../src/contexts/identity/app/use-cases/authenticate'
import { createGetCurrentAccount } from '../../src/contexts/identity/app/use-cases/get-current-account'
import { createLogin } from '../../src/contexts/identity/app/use-cases/login'
import { createLogout } from '../../src/contexts/identity/app/use-cases/logout'
import { createLogoutAll } from '../../src/contexts/identity/app/use-cases/logout-all'
import { createRefreshSession } from '../../src/contexts/identity/app/use-cases/refresh-session'
import { createRegisterAccount } from '../../src/contexts/identity/app/use-cases/register-account'
import { createChangeAccountRole } from '../../src/contexts/identity/app/use-cases/change-account-role'
import { createListAccounts } from '../../src/contexts/identity/app/use-cases/list-accounts'
import { createReactivateAccount } from '../../src/contexts/identity/app/use-cases/reactivate-account'
import { createSuspendAccount } from '../../src/contexts/identity/app/use-cases/suspend-account'
import { createGetMyInventory } from '../../src/contexts/inventory/app/use-cases/get-my-inventory'
import { type AppOptions, createApp } from '../../src/platform/http/app'
import { FakePasswordHasher, FakeTokenGenerator, FixedClock } from './fake-ports'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from './in-memory-unit-of-work'

/** Application HTTP complète sur les faux : jamais `main.ts`, jamais de base. */
export function buildTestApp(overrides: Partial<Omit<AppOptions, 'logger'>> = {}) {
    const database = new InMemoryDatabase()
    const passwordHasher = new FakePasswordHasher()
    const tokenGenerator = new FakeTokenGenerator()
    const clock = new FixedClock()
    const random = database.random // handler de butin : 0,9 par défaut (aucun butin), modifiable par les tests

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
            refreshSession: createRefreshSession(deps),
            logout: createLogout(deps),
            logoutAll: createLogoutAll(deps),
            authenticate: createAuthenticate(deps),
            getCurrentAccount: createGetCurrentAccount(deps),
            listAccounts: createListAccounts(deps),
            suspendAccount: createSuspendAccount(deps),
            reactivateAccount: createReactivateAccount(deps),
            changeAccountRole: createChangeAccountRole(deps),
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
