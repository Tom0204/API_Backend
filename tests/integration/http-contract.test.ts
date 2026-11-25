import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

// docs/conventions.md §4 et §5 ; les statuts par `kind` et le 500 sont dans error-handler.test.ts.
describe('contrat HTTP', () => {
    const { app } = buildTestApp()

    it('champ inconnu → 400 VALIDATION_ERROR avec details', async () => {
        const response = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'alice@example.com', password: VALID_PASSWORD, isAdmin: true })

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
            success: false,
            message: 'Validation failed',
            error: { code: 'VALIDATION_ERROR', details: [{ field: 'isAdmin', message: 'Unknown field' }] }
        })
    })

    it('champs manquants ou de mauvais type → un détail par champ', async () => {
        const response = await request(app).post('/api/v1/auth/register').send({ email: 42 })

        expect(response.status).toBe(400)
        expect(response.body.error.details.map((detail: { field: string }) => detail.field).sort()).toEqual([
            'email',
            'password'
        ])
    })

    it('paramètre de requête inconnu → 400', async () => {
        const response = await request(app)
            .post('/api/v1/auth/login?debug=1')
            .send({ email: 'alice@example.com', password: VALID_PASSWORD })

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field: 'debug', message: 'Unknown field' }])
    })

    it('corps qui n’est pas un objet → 400 VALIDATION_ERROR', async () => {
        const response = await request(app).post('/api/v1/auth/register').set('Content-Type', 'application/json').send('[]')

        expect(response.status).toBe(400)
        expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('JSON invalide → 400 INVALID_JSON', async () => {
        const response = await request(app)
            .post('/api/v1/auth/register')
            .set('Content-Type', 'application/json')
            .send('{"email": ')

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
            success: false,
            message: 'Invalid JSON',
            error: { code: 'INVALID_JSON', details: [] }
        })
    })

    it('route inconnue → 404 ROUTE_NOT_FOUND', async () => {
        const response = await request(app).get('/api/v1/unknown')

        expect(response.status).toBe(404)
        expect(response.body).toEqual({
            success: false,
            message: 'Route not found',
            error: { code: 'ROUTE_NOT_FOUND', details: [] }
        })
    })

    it('méthode non prévue sur une route existante → 404 ROUTE_NOT_FOUND', async () => {
        const response = await request(app).delete('/api/v1/auth/register')

        expect(response.status).toBe(404)
        expect(response.body.error.code).toBe('ROUTE_NOT_FOUND')
    })
})
