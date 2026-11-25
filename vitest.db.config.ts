import { defineConfig } from 'vitest/config'

// Tests PostgreSQL (npm run test:db), sur mmorpg_test uniquement. Fichiers en série : base partagée.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/database/**/*.test.ts'],
        globalSetup: ['tests/database/global-setup.ts'],
        fileParallelism: false,
        testTimeout: 20_000,
        hookTimeout: 60_000
    }
})
