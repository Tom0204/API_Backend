import { defineConfig } from 'vitest/config'

// Tests sans base : domaine, cas d'usage, HTTP (repositories en mémoire) et architecture.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        exclude: ['tests/database/**', 'node_modules/**'],
        restoreMocks: true
    }
})
