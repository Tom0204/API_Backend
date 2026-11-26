import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/platform/logging/logger'

describe('logger', () => {
    it("masque toute URL de connexion PostgreSQL, y compris dans le message et la pile d'une erreur", () => {
        const lines: string[] = []
        const logger = createLogger(
            'info',
            new Writable({
                write(chunk: Buffer, _encoding, callback) {
                    lines.push(chunk.toString())
                    callback()
                }
            })
        )

        logger.error(
            { err: new Error('connect failed for postgresql://mmorpg:s3cret@db:5432/mmorpg_dev') },
            'Unexpected error postgres://user:pw@host/db'
        )

        const output = lines.join('')
        expect(output).not.toContain('s3cret')
        expect(output).not.toContain('user:pw')
        expect(output).toContain('postgresql://[REDACTED]')
        expect(() => JSON.parse(output)).not.toThrow()
    })
})
