import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { DomainError, type DomainErrorKind } from '../../src/domain/shared/domain-error'
import { asyncHandler } from '../../src/interfaces/http/async-handler'
import { errorHandler } from '../../src/interfaces/http/middlewares/error-handler'

function appThrowing(error: unknown) {
    const app = express()
    app.get(
        '/boom',
        asyncHandler(async () => {
            throw error
        })
    )
    app.use(errorHandler)
    return app
}

describe('traduction des erreurs', () => {
    const cases: [DomainErrorKind, number][] = [
        ['UNAUTHENTICATED', 401],
        ['NOT_FOUND', 404],
        ['CONFLICT', 409],
        ['RULE_VIOLATION', 422]
    ]

    it.each(cases)('DomainError %s → %i, enveloppe d’erreur', async (kind, status) => {
        const response = await request(appThrowing(new DomainError('SOME_CODE', kind, 'Some message'))).get('/boom')

        expect(response.status).toBe(status)
        expect(response.body).toEqual({
            success: false,
            message: 'Some message',
            error: { code: 'SOME_CODE', details: [] }
        })
    })

    it('ajoute WWW-Authenticate sur un 401', async () => {
        const response = await request(appThrowing(new DomainError('X', 'UNAUTHENTICATED', 'X'))).get('/boom')

        expect(response.headers['www-authenticate']).toBe('Bearer realm="api"')
    })

    it('toute autre erreur (asynchrone) → 500 générique, sans détail interne', async () => {
        const response = await request(appThrowing(new Error('SELECT * FROM accounts failed'))).get('/boom')

        expect(response.status).toBe(500)
        expect(response.body).toEqual({
            success: false,
            message: 'Internal server error',
            error: { code: 'INTERNAL_ERROR', details: [] }
        })
        expect(JSON.stringify(response.body)).not.toContain('SELECT')
    })
})
