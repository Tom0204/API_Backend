import { afterEach, describe, expect, it } from 'vitest'
import { requireTestDatabaseUrl } from './test-database'

describe('garde de la base de test', () => {
    const original = { NODE_ENV: process.env.NODE_ENV, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL }

    afterEach(() => {
        process.env.NODE_ENV = original.NODE_ENV
        process.env.TEST_DATABASE_URL = original.TEST_DATABASE_URL
    })

    it('accepte mmorpg_test', () => {
        process.env.TEST_DATABASE_URL = 'postgresql://user:secret@localhost:5432/mmorpg_test'

        expect(requireTestDatabaseUrl()).toContain('/mmorpg_test')
    })

    it.each(['mmorpg_dev', 'mmorpg_test_copy', 'postgres'])('refuse la base %s sans citer l’URL', (database) => {
        process.env.TEST_DATABASE_URL = `postgresql://user:secret@localhost:5432/${database}`

        expect(() => requireTestDatabaseUrl()).toThrow(/doit viser la base mmorpg_test$/)
        expect(() => requireTestDatabaseUrl()).not.toThrow(/secret/)
    })

    it('refuse si NODE_ENV ne vaut pas "test"', () => {
        process.env.NODE_ENV = 'development'

        expect(() => requireTestDatabaseUrl()).toThrow('NODE_ENV doit valoir "test"')
    })
})
