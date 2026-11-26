import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { MAX_FAILED_LOGIN_ATTEMPTS } from '../../src/contexts/identity/domain/account'
import { ACCESS_TOKEN_DURATION_MS, REFRESH_TOKEN_DURATION_MS } from '../../src/contexts/identity/domain/session'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

type App = ReturnType<typeof buildTestApp>['app']

async function registerAndLoginTokens(app: App, email = 'alice@example.com') {
    await request(app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD })
    const response = await request(app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD })
    return response.body.data as { accessToken: string; refreshToken: string }
}

async function registerAndLogin(app: App, email = 'alice@example.com') {
    return (await registerAndLoginTokens(app, email)).accessToken
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
    it("200 : jeton d'accès (15 min) et jeton de rafraîchissement (7 jours)", async () => {
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
                accessToken: 'token-1',
                refreshToken: 'token-2',
                tokenType: 'Bearer',
                accessExpiresAt: new Date(clock.now().getTime() + ACCESS_TOKEN_DURATION_MS).toISOString(),
                refreshExpiresAt: new Date(clock.now().getTime() + REFRESH_TOKEN_DURATION_MS).toISOString()
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

    it("401 : jeton d'accès expiré (horloge de test)", async () => {
        const { app, clock } = buildTestApp()
        const token = await registerAndLogin(app)

        clock.advance(ACCESS_TOKEN_DURATION_MS)
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

const unauthenticated = {
    success: false,
    message: 'Authentication required',
    error: { code: 'UNAUTHENTICATED', details: [] }
}

const refresh = (app: App, refreshToken: string) =>
    request(app).post('/api/v1/auth/refresh').send({ refreshToken })
const me = (app: App, accessToken: string) =>
    request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`)

describe('POST /api/v1/auth/refresh (AUTH-01)', () => {
    it('200 : nouveaux jetons ; les anciens jetons → 401', async () => {
        const { app, clock } = buildTestApp()
        const first = await registerAndLoginTokens(app)
        clock.advance(60_000)

        const response = await refresh(app, first.refreshToken)

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: 'Session refreshed successfully',
            data: {
                accessToken: 'token-3',
                refreshToken: 'token-4',
                tokenType: 'Bearer',
                accessExpiresAt: new Date(clock.now().getTime() + ACCESS_TOKEN_DURATION_MS).toISOString(),
                refreshExpiresAt: new Date(clock.now().getTime() - 60_000 + REFRESH_TOKEN_DURATION_MS).toISOString()
            }
        })
        expect((await me(app, first.accessToken)).status).toBe(401)
        expect((await me(app, response.body.data.accessToken)).status).toBe(200)
    })

    it('réutilisation → 401 UNAUTHENTICATED et toute la famille révoquée', async () => {
        const { app } = buildTestApp()
        const first = await registerAndLoginTokens(app)
        const second = (await refresh(app, first.refreshToken)).body.data

        const reused = await refresh(app, first.refreshToken)

        expect(reused.status).toBe(401)
        expect(reused.headers['www-authenticate']).toBe('Bearer realm="api"')
        expect(reused.body).toEqual(unauthenticated)
        expect((await me(app, second.accessToken)).status).toBe(401)
        expect((await refresh(app, second.refreshToken)).status).toBe(401)
    })

    it('jeton inconnu, ou famille échue (horloge de test) → 401', async () => {
        const { app, clock } = buildTestApp()
        const { refreshToken } = await registerAndLoginTokens(app)

        expect((await refresh(app, 'token-inconnu')).body).toEqual(unauthenticated)
        clock.advance(REFRESH_TOKEN_DURATION_MS)
        expect((await refresh(app, refreshToken)).status).toBe(401)
    })

    it.each([
        ['corps vide', {}, 'refreshToken'],
        ['champ inconnu', { refreshToken: 'token-1', extra: true }, 'extra'],
        ['jeton mal formé', { refreshToken: 'pas un jeton' }, 'refreshToken']
    ])('400 : %s', async (_label, body, field) => {
        const { app } = buildTestApp()

        const response = await request(app).post('/api/v1/auth/refresh').send(body)

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }])
    })

    it('route publique : aucun en-tête Authorization requis', async () => {
        const { app } = buildTestApp()
        const { refreshToken } = await registerAndLoginTokens(app)

        expect((await refresh(app, refreshToken)).status).toBe(200)
    })
})

describe('POST /api/v1/auth/logout et /logout-all (AUTH-02)', () => {
    const logout = (app: App, path: string, accessToken: string) =>
        request(app).post(path).set('Authorization', `Bearer ${accessToken}`)

    it('logout : 204 sans corps ; jetons de la session → 401 ; autre session active', async () => {
        const { app } = buildTestApp()
        const current = await registerAndLoginTokens(app)
        const other = (await request(app).post('/api/v1/auth/login').send({ email: 'alice@example.com', password: VALID_PASSWORD })).body.data

        const response = await logout(app, '/api/v1/auth/logout', current.accessToken)

        expect(response.status).toBe(204)
        expect(response.text).toBe('')
        expect((await me(app, current.accessToken)).status).toBe(401)
        expect((await refresh(app, current.refreshToken)).status).toBe(401)
        expect((await me(app, other.accessToken)).status).toBe(200)
    })

    it('logout-all : 204 ; toutes les sessions du compte → 401, pas celles des autres comptes', async () => {
        const { app } = buildTestApp()
        const first = await registerAndLoginTokens(app)
        const second = (await request(app).post('/api/v1/auth/login').send({ email: 'alice@example.com', password: VALID_PASSWORD })).body.data
        const bob = await registerAndLoginTokens(app, 'bob@example.com')

        const response = await logout(app, '/api/v1/auth/logout-all', first.accessToken)

        expect(response.status).toBe(204)
        expect(response.text).toBe('')
        for (const tokens of [first, second]) {
            expect((await me(app, tokens.accessToken)).status).toBe(401)
            expect((await refresh(app, tokens.refreshToken)).status).toBe(401)
        }
        expect((await me(app, bob.accessToken)).status).toBe(200)
    })

    it.each(['/api/v1/auth/logout', '/api/v1/auth/logout-all'])('%s : 401 sans jeton, 400 avec un champ inconnu', async (path) => {
        const { app } = buildTestApp()
        const { accessToken } = await registerAndLoginTokens(app)

        const anonymous = await request(app).post(path)
        const withBody = await request(app).post(path).set('Authorization', `Bearer ${accessToken}`).send({ all: true })

        expect(anonymous.status).toBe(401)
        expect(anonymous.headers['www-authenticate']).toBe('Bearer realm="api"')
        expect(withBody.status).toBe(400)
        expect((await me(app, accessToken)).status).toBe(200) // requête refusée : aucune déconnexion
    })

    it('une seconde déconnexion avec le même jeton → 401', async () => {
        const { app } = buildTestApp()
        const { accessToken } = await registerAndLoginTokens(app)

        await logout(app, '/api/v1/auth/logout', accessToken)

        expect((await logout(app, '/api/v1/auth/logout', accessToken)).status).toBe(401)
    })
})

describe('Verrouillage après échecs de connexion (AUTH-03)', () => {
    const login = (app: App, email: string, password: string) =>
        request(app).post('/api/v1/auth/login').send({ email, password })

    it('compte verrouillé : même 401 qu’un email inconnu, même avec le bon mot de passe', async () => {
        const { app } = buildTestApp()
        await request(app).post('/api/v1/auth/register').send({ email: 'alice@example.com', password: VALID_PASSWORD })
        for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
            await login(app, 'alice@example.com', 'wrong-password')
        }

        const locked = await login(app, 'alice@example.com', VALID_PASSWORD)
        const unknown = await login(app, 'nobody@example.com', VALID_PASSWORD)

        expect(locked.status).toBe(401)
        expect(locked.headers['www-authenticate']).toBe('Bearer realm="api"')
        expect(locked.body).toEqual(unknown.body)
        expect(locked.body.error.code).toBe('INVALID_CREDENTIALS')
    })
})
