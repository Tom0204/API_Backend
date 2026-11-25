import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { SESSION_DURATION_MS } from '../../src/domain/identity/session'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

async function registerAndLogin(app: ReturnType<typeof buildTestApp>['app'], email = 'alice@example.com') {
    await request(app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD })
    const response = await request(app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD })
    return response.body.data.token as string
}

describe('POST /api/v1/auth/register', () => {
    it('201 : compte créé, email en minuscules, ni mot de passe ni hash', async () => {
        const { app } = buildTestApp()

        const response = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'Alice@Example.com', password: VALID_PASSWORD })

        expect(response.status).toBe(201)
        expect(response.body).toEqual({
            success: true,
            message: 'Account created successfully',
            data: { id: expect.any(String), email: 'alice@example.com', createdAt: expect.any(String) }
        })
        expect(new Date(response.body.data.createdAt).toISOString()).toBe(response.body.data.createdAt)
        expect(JSON.stringify(response.body)).not.toContain(VALID_PASSWORD)
        expect(JSON.stringify(response.body)).not.toContain('hashed')
    })

    it.each([
        ['email invalide', { email: 'pas-un-email', password: VALID_PASSWORD }, 'email'],
        ['mot de passe de 14 caractères', { email: 'a@example.com', password: 'a'.repeat(14) }, 'password'],
        ['mot de passe de 129 caractères', { email: 'a@example.com', password: 'a'.repeat(129) }, 'password']
    ])('400 : %s', async (_label, body, field) => {
        const { app } = buildTestApp()

        const response = await request(app).post('/api/v1/auth/register').send(body)

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }])
    })

    it('409 EMAIL_ALREADY_USED, quelle que soit la casse', async () => {
        const { app } = buildTestApp()
        await request(app).post('/api/v1/auth/register').send({ email: 'alice@example.com', password: VALID_PASSWORD })

        const response = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'ALICE@example.com', password: VALID_PASSWORD })

        expect(response.status).toBe(409)
        expect(response.body).toEqual({
            success: false,
            message: 'Email already used',
            error: { code: 'EMAIL_ALREADY_USED', details: [] }
        })
    })
})

describe('POST /api/v1/auth/login', () => {
    it('200 : jeton Bearer valable 24 h', async () => {
        const { app, clock } = buildTestApp()
        await request(app).post('/api/v1/auth/register').send({ email: 'alice@example.com', password: VALID_PASSWORD })

        const response = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'alice@example.com', password: VALID_PASSWORD })

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: 'Login successful',
            data: {
                token: 'token-1',
                tokenType: 'Bearer',
                expiresAt: new Date(clock.now().getTime() + SESSION_DURATION_MS).toISOString()
            }
        })
    })

    it('email inconnu et mauvais mot de passe → 401 strictement identiques', async () => {
        const { app } = buildTestApp()
        await request(app).post('/api/v1/auth/register').send({ email: 'alice@example.com', password: VALID_PASSWORD })

        const wrongPassword = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'alice@example.com', password: 'wrong-password' })
        const unknownEmail = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'nobody@example.com', password: VALID_PASSWORD })

        for (const response of [wrongPassword, unknownEmail]) {
            expect(response.status).toBe(401)
            expect(response.headers['www-authenticate']).toBe('Bearer realm="api"')
        }
        expect(unknownEmail.body).toEqual(wrongPassword.body)
        expect(wrongPassword.body).toEqual({
            success: false,
            message: 'Invalid email or password',
            error: { code: 'INVALID_CREDENTIALS', details: [] }
        })
    })

    it("400 si le mot de passe est vide (pas de minimum de 15 caractères à la connexion)", async () => {
        const { app } = buildTestApp()

        const empty = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: '' })
        const short = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'short' })

        expect(empty.status).toBe(400)
        expect(short.status).toBe(401)
    })
})

describe('GET /api/v1/auth/me', () => {
    const unauthenticatedBody = {
        success: false,
        message: 'Authentication required',
        error: { code: 'UNAUTHENTICATED', details: [] }
    }

    it('200 : compte du propriétaire du jeton', async () => {
        const { app } = buildTestApp()
        const token = await registerAndLogin(app)

        const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: 'Account retrieved successfully',
            data: { id: expect.any(String), email: 'alice@example.com', createdAt: expect.any(String) }
        })
    })

    it.each([
        ['absent', undefined],
        ['mal formé', 'Token abc'],
        ['vide', 'Bearer '],
        ['inconnu', 'Bearer token-inconnu']
    ])('401 UNAUTHENTICATED : jeton %s, avec WWW-Authenticate', async (_label, authorization) => {
        const { app } = buildTestApp()
        await registerAndLogin(app)

        const call = request(app).get('/api/v1/auth/me')
        const response = await (authorization ? call.set('Authorization', authorization) : call)

        expect(response.status).toBe(401)
        expect(response.headers['www-authenticate']).toBe('Bearer realm="api"')
        expect(response.body).toEqual(unauthenticatedBody)
    })

    it('401 : jeton expiré (horloge de test)', async () => {
        const { app, clock } = buildTestApp()
        const token = await registerAndLogin(app)

        clock.advance(SESSION_DURATION_MS)
        const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)

        expect(response.status).toBe(401)
        expect(response.body).toEqual(unauthenticatedBody)
    })

    it('chaque jeton désigne son propre compte', async () => {
        const { app } = buildTestApp()
        const aliceToken = await registerAndLogin(app, 'alice@example.com')
        const bobToken = await registerAndLogin(app, 'bob@example.com')

        const alice = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${aliceToken}`)
        const bob = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${bobToken}`)

        expect(alice.body.data.email).toBe('alice@example.com')
        expect(bob.body.data.email).toBe('bob@example.com')
    })

    it("l'authentification passe avant la validation : sans jeton, un paramètre inconnu donne 401", async () => {
        const { app } = buildTestApp()

        const response = await request(app).get('/api/v1/auth/me?x=1')

        expect(response.status).toBe(401)
    })
})
