import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp } from '../fakes/test-app'

describe('GET /health', () => {
    const { app } = buildTestApp()

    it("répond 200 dans l'enveloppe de succès", async () => {
        const response = await request(app).get('/health')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: 'Service is healthy',
            data: { status: 'UP' }
        })
    })

    it("n'expose pas l'en-tête X-Powered-By", async () => {
        const response = await request(app).get('/health')

        expect(response.headers['x-powered-by']).toBeUndefined()
    })

    it('refuse un paramètre de requête inconnu (400)', async () => {
        const response = await request(app).get('/health?verbose=true')

        expect(response.status).toBe(400)
        expect(response.body.error).toEqual({
            code: 'VALIDATION_ERROR',
            details: [{ field: 'verbose', message: 'Unknown field' }]
        })
    })

    it("n'est pas limitée en débit", async () => {
        const { app: limited } = buildTestApp({
            rateLimits: { api: { limit: 1, windowMs: 60_000 }, auth: { limit: 1, windowMs: 60_000 } }
        })

        for (let i = 0; i < 3; i += 1) {
            expect((await request(limited).get('/health')).status).toBe(200)
        }
    })
})
