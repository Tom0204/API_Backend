import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

const TIGHT_LIMITS = {
    api: { limit: 3, windowMs: 60_000 },
    auth: { limit: 2, windowMs: 60_000 }
}

describe('protections HTTP (conventions.md §7)', () => {
    it('corps de plus de 10 Ko → 413 PAYLOAD_TOO_LARGE', async () => {
        const { app } = buildTestApp()

        const response = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'a@example.com', password: 'x'.repeat(11 * 1024) })

        expect(response.status).toBe(413)
        expect(response.body).toEqual({
            success: false,
            message: 'Payload too large',
            error: { code: 'PAYLOAD_TOO_LARGE', details: [] }
        })
    })

    it('corps non JSON → 415 UNSUPPORTED_MEDIA_TYPE', async () => {
        const { app } = buildTestApp()

        const response = await request(app)
            .post('/api/v1/auth/register')
            .set('Content-Type', 'application/x-www-form-urlencoded')
            .send('email=a@example.com')

        expect(response.status).toBe(415)
        expect(response.body.error).toEqual({ code: 'UNSUPPORTED_MEDIA_TYPE', details: [] })
    })

    it('register : au-delà de la limite → 429 RATE_LIMITED avec Retry-After', async () => {
        const { app } = buildTestApp({ rateLimits: TIGHT_LIMITS })
        const register = () => request(app).post('/api/v1/auth/register').send({ email: 'x@example.com', password: VALID_PASSWORD })

        await register()
        await register()
        const response = await register()

        expect(response.status).toBe(429)
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
        expect(response.body).toEqual({
            success: false,
            message: 'Too many requests',
            error: { code: 'RATE_LIMITED', details: [] }
        })
    })

    it('login : limite propre à la route → 429 avec Retry-After, indépendante de register', async () => {
        const { app } = buildTestApp({ rateLimits: { ...TIGHT_LIMITS, api: { limit: 100, windowMs: 60_000 } } })
        const login = () => request(app).post('/api/v1/auth/login').send({ email: 'x@example.com', password: VALID_PASSWORD })

        await login()
        await login()
        const limited = await login()
        const register = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'y@example.com', password: VALID_PASSWORD })

        expect(limited.status).toBe(429)
        expect(limited.headers['retry-after']).toBeDefined()
        expect(limited.body.error.code).toBe('RATE_LIMITED')
        expect(register.status).toBe(201)
    })

    it('/api/v1 : au-delà de la limite globale → 429, /health reste disponible', async () => {
        const { app } = buildTestApp({ rateLimits: TIGHT_LIMITS })

        for (let i = 0; i < TIGHT_LIMITS.api.limit; i += 1) {
            await request(app).get('/api/v1/auth/me')
        }
        const limited = await request(app).get('/api/v1/auth/me')
        const health = await request(app).get('/health')

        expect(limited.status).toBe(429)
        expect(limited.headers['retry-after']).toBeDefined()
        expect(health.status).toBe(200)
    })

    it('en-têtes Helmet présents', async () => {
        const { app } = buildTestApp()

        const response = await request(app).get('/health')

        expect(response.headers['x-content-type-options']).toBe('nosniff')
        expect(response.headers['content-security-policy']).toBeDefined()
    })

    it('CORS : aucune origine externe par défaut, seulement les origines configurées', async () => {
        const closed = buildTestApp().app
        const open = buildTestApp({ corsOrigins: ['https://client.example.com'] }).app

        const refused = await request(closed).get('/health').set('Origin', 'https://evil.example.com')
        const allowed = await request(open).get('/health').set('Origin', 'https://client.example.com')
        const other = await request(open).get('/health').set('Origin', 'https://evil.example.com')

        expect(refused.headers['access-control-allow-origin']).toBeUndefined()
        expect(allowed.headers['access-control-allow-origin']).toBe('https://client.example.com')
        expect(other.headers['access-control-allow-origin']).toBeUndefined()
    })
})

describe('X-Request-Id et logs', () => {
    it('génère un identifiant et le renvoie', async () => {
        const { app } = buildTestApp()

        const response = await request(app).get('/health')

        expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    })

    it("reprend l'identifiant du client s'il est sûr, le remplace sinon", async () => {
        const { app } = buildTestApp()

        const kept = await request(app).get('/health').set('X-Request-Id', 'postman-run-42')
        const replaced = await request(app).get('/health').set('X-Request-Id', 'a"b<script>')

        expect(kept.headers['x-request-id']).toBe('postman-run-42')
        expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('journalise identifiant, méthode, motif de route et statut, sans corps, jeton, paramètre ni URL', async () => {
        const { app, logLines } = buildTestApp()
        await request(app)
            .post('/api/v1/auth/register?trace=secret-query-value')
            .set('X-Request-Id', 'req-register')
            .send({ email: 'logged@example.com', password: VALID_PASSWORD })
        await request(app).post('/api/v1/auth/register').send({ email: 'logged@example.com', password: VALID_PASSWORD })
        const login = await request(app)
            .post('/api/v1/auth/login')
            .set('X-Request-Id', 'req-login')
            .send({ email: 'logged@example.com', password: VALID_PASSWORD })
        await request(app)
            .get('/api/v1/auth/me')
            .set('X-Request-Id', 'req-me')
            .set('Authorization', `Bearer ${login.body.data.accessToken}`)

        const logs = logLines.join('\n')
        const entries = logLines.map((line) => JSON.parse(line))
        const me = entries.find((entry) => entry.req?.id === 'req-me')

        expect(me).toMatchObject({
            req: { id: 'req-me', method: 'GET' },
            route: '/api/v1/auth/me',
            res: { statusCode: 200 },
            responseTime: expect.any(Number)
        })
        expect(entries.find((entry) => entry.req?.id === 'req-register')?.route).toBe('/api/v1/auth/register')
        for (const secret of [VALID_PASSWORD, login.body.data.accessToken, 'logged@example.com', 'secret-query-value', 'Bearer']) {
            expect(logs).not.toContain(secret)
        }
    })

    it('route inconnue journalisée comme (unmatched), sans le chemin reçu', async () => {
        const { app, logLines } = buildTestApp()

        await request(app).get('/api/v1/private-path-segment')

        const logs = logLines.join('\n')
        expect(logs).toContain('(unmatched)')
        expect(logs).not.toContain('private-path-segment')
    })
})
