import { execFileSync } from 'node:child_process'
import { requireTestDatabaseUrl } from './test-database'

/** Avant les tests PostgreSQL : garde de la base, puis migrations appliquées sur `mmorpg_test` uniquement. */
export default function setup(): void {
    const testDatabaseUrl = requireTestDatabaseUrl()

    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: testDatabaseUrl },
        stdio: ['ignore', 'ignore', 'inherit']
    })
}
