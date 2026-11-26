import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { ROLES, type RoleName } from '../../src/contexts/identity/domain/permissions'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

type TestApp = ReturnType<typeof buildTestApp>

const FORBIDDEN_BODY = { success: false, message: 'Insufficient permissions', error: { code: 'FORBIDDEN', details: [] } }

/** Inscrit un compte, lui donne un rôle directement en base (comme le seed), puis le connecte. */
async function signIn(ctx: TestApp, name: string, role: RoleName = 'PLAYER') {
    const email = `${name}@example.com`
    const registered = await request(ctx.app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD })
    const id: string = registered.body.data.id
    setPermissions(ctx, id, ROLES[role])
    const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD })
    return { id, email, token: login.body.data.accessToken as string }
}

function setPermissions(ctx: TestApp, id: string, mask: number) {
    const record = ctx.database.state.accounts.find((account) => account.id === id)
    if (!record) throw new Error(`Compte inconnu : ${id}`)
    record.permissions = mask
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

describe('Contrôle centralisé des permissions (ROLE-02)', () => {
    it('route de jeu : 200 avec PLAY ; retrait de PLAY → 403 FORBIDDEN dès la requête suivante', async () => {
        const ctx = buildTestApp()
        const alice = await signIn(ctx, 'alice')

        expect((await request(ctx.app).get('/api/v1/characters').set(auth(alice.token))).status).toBe(200)

        setPermissions(ctx, alice.id, 0)
        const response = await request(ctx.app).get('/api/v1/characters').set(auth(alice.token))

        expect(response.status).toBe(403)
        expect(response.body).toEqual(FORBIDDEN_BODY)
        expect(response.headers['www-authenticate']).toBeUndefined()
    })

    it('sans PLAY : /auth/me et /classes restent accessibles (L7 D2)', async () => {
        const ctx = buildTestApp()
        const alice = await signIn(ctx, 'alice')
        setPermissions(ctx, alice.id, 0)

        expect((await request(ctx.app).get('/api/v1/auth/me').set(auth(alice.token))).status).toBe(200)
        expect((await request(ctx.app).get('/api/v1/classes')).status).toBe(200)
    })

    it('sans jeton : 401 avant tout contrôle de permission', async () => {
        const { app } = buildTestApp()

        for (const response of [
            await request(app).get('/api/v1/characters'),
            await request(app).get('/api/v1/admin/accounts')
        ]) {
            expect(response.status).toBe(401)
            expect(response.headers['www-authenticate']).toBe('Bearer realm="api"')
        }
    })
})

describe('GET /api/v1/admin/accounts', () => {
    it('403 pour un joueur ; 200 pour un modérateur, liste blanche sans donnée sensible (L7 D8)', async () => {
        const ctx = buildTestApp()
        const moderator = await signIn(ctx, 'moderator', 'MODERATOR')
        const bob = await signIn(ctx, 'bob')

        expect((await request(ctx.app).get('/api/v1/admin/accounts').set(auth(bob.token))).body).toEqual(FORBIDDEN_BODY)

        const response = await request(ctx.app).get('/api/v1/admin/accounts').set(auth(moderator.token))

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: 'Accounts retrieved successfully',
            data: [
                { id: moderator.id, email: moderator.email, role: 'MODERATOR', suspendedAt: null, createdAt: expect.any(String) },
                { id: bob.id, email: bob.email, role: 'PLAYER', suspendedAt: null, createdAt: expect.any(String) }
            ]
        })
        const text = JSON.stringify(response.body)
        for (const secret of ['hashed', VALID_PASSWORD, 'failedLoginCount', 'lockedUntil', 'permissions']) {
            expect(text).not.toContain(secret)
        }
    })

    it('paramètre de requête inconnu → 400', async () => {
        const ctx = buildTestApp()
        const admin = await signIn(ctx, 'admin', 'ADMIN')

        const response = await request(ctx.app).get('/api/v1/admin/accounts?page=2').set(auth(admin.token))

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field: 'page', message: 'Unknown field' }])
    })
})

describe('POST /api/v1/admin/accounts/:accountId/suspension et /reactivation', () => {
    it('suspension : sessions révoquées, connexion refusée ; réactivation : connexion de nouveau possible', async () => {
        const ctx = buildTestApp()
        const moderator = await signIn(ctx, 'moderator', 'MODERATOR')
        const bob = await signIn(ctx, 'bob')

        const suspended = await request(ctx.app)
            .post(`/api/v1/admin/accounts/${bob.id}/suspension`)
            .set(auth(moderator.token))

        expect(suspended.status).toBe(200)
        expect(suspended.body).toMatchObject({
            message: 'Account suspended successfully',
            data: { id: bob.id, role: 'PLAYER', suspendedAt: ctx.clock.now().toISOString() }
        })
        expect((await request(ctx.app).get('/api/v1/auth/me').set(auth(bob.token))).status).toBe(401)
        const login = await request(ctx.app).post('/api/v1/auth/login').send({ email: bob.email, password: VALID_PASSWORD })
        expect(login.status).toBe(401)
        expect(login.body.error.code).toBe('INVALID_CREDENTIALS')

        const reactivated = await request(ctx.app)
            .post(`/api/v1/admin/accounts/${bob.id}/reactivation`)
            .set(auth(moderator.token))

        expect(reactivated.status).toBe(200)
        expect(reactivated.body).toMatchObject({ message: 'Account reactivated successfully', data: { suspendedAt: null } })
        expect(
            (await request(ctx.app).post('/api/v1/auth/login').send({ email: bob.email, password: VALID_PASSWORD })).status
        ).toBe(200)
    })

    it.each(['suspension', 'reactivation'])('%s : 403 pour un joueur, aucun effet', async (action) => {
        const ctx = buildTestApp()
        const alice = await signIn(ctx, 'alice')
        const bob = await signIn(ctx, 'bob')

        const response = await request(ctx.app).post(`/api/v1/admin/accounts/${bob.id}/${action}`).set(auth(alice.token))

        expect(response.status).toBe(403)
        expect(response.body).toEqual(FORBIDDEN_BODY)
        expect(ctx.database.state.accounts.find((account) => account.id === bob.id)?.suspendedAt).toBeNull()
    })

    it('modérateur contre administrateur → 403 (L7 D5) ; soi-même → 422 (L7 D6)', async () => {
        const ctx = buildTestApp()
        const moderator = await signIn(ctx, 'moderator', 'MODERATOR')
        const admin = await signIn(ctx, 'admin', 'ADMIN')

        const onAdmin = await request(ctx.app)
            .post(`/api/v1/admin/accounts/${admin.id}/suspension`)
            .set(auth(moderator.token))
        const onSelf = await request(ctx.app)
            .post(`/api/v1/admin/accounts/${moderator.id}/suspension`)
            .set(auth(moderator.token))

        expect(onAdmin.status).toBe(403)
        expect(onSelf.status).toBe(422)
        expect(onSelf.body).toEqual({
            success: false,
            message: 'Cannot administer your own account',
            error: { code: 'SELF_ADMINISTRATION_REFUSED', details: [] }
        })
    })

    it('compte inconnu → 404 ACCOUNT_NOT_FOUND ; identifiant invalide → 400', async () => {
        const ctx = buildTestApp()
        const admin = await signIn(ctx, 'admin', 'ADMIN')

        const unknown = await request(ctx.app)
            .post(`/api/v1/admin/accounts/${randomUUID()}/suspension`)
            .set(auth(admin.token))
        const invalid = await request(ctx.app).post('/api/v1/admin/accounts/abc/suspension').set(auth(admin.token))

        expect(unknown.status).toBe(404)
        expect(unknown.body.error.code).toBe('ACCOUNT_NOT_FOUND')
        expect(invalid.status).toBe(400)
        expect(invalid.body.error.details).toEqual([{ field: 'accountId', message: 'Must be a valid UUID' }])
    })
})

describe('PUT /api/v1/admin/accounts/:accountId/role', () => {
    it('200 pour un administrateur ; le nouveau rôle ouvre les routes correspondantes', async () => {
        const ctx = buildTestApp()
        const admin = await signIn(ctx, 'admin', 'ADMIN')
        const bob = await signIn(ctx, 'bob')

        const response = await request(ctx.app)
            .put(`/api/v1/admin/accounts/${bob.id}/role`)
            .set(auth(admin.token))
            .send({ role: 'MODERATOR' })

        expect(response.status).toBe(200)
        expect(response.body).toMatchObject({ message: 'Account role updated successfully', data: { role: 'MODERATOR' } })
        expect((await request(ctx.app).get('/api/v1/admin/accounts').set(auth(bob.token))).status).toBe(200)
    })

    it('403 pour un modérateur (pas ACCOUNTS_MANAGE_ROLES)', async () => {
        const ctx = buildTestApp()
        const moderator = await signIn(ctx, 'moderator', 'MODERATOR')
        const bob = await signIn(ctx, 'bob')

        const response = await request(ctx.app)
            .put(`/api/v1/admin/accounts/${bob.id}/role`)
            .set(auth(moderator.token))
            .send({ role: 'MODERATOR' })

        expect(response.status).toBe(403)
    })

    it('retirer ses propres droits → 422, rôle inchangé (L7 D6)', async () => {
        const ctx = buildTestApp()
        const admin = await signIn(ctx, 'admin', 'ADMIN')

        const response = await request(ctx.app)
            .put(`/api/v1/admin/accounts/${admin.id}/role`)
            .set(auth(admin.token))
            .send({ role: 'PLAYER' })

        expect(response.status).toBe(422)
        expect(ctx.database.state.accounts[0]?.permissions).toBe(ROLES.ADMIN)
    })

    it.each([
        ['rôle inconnu', { role: 'SUPERUSER' }, 'role'],
        ['masque brut', { role: 15 }, 'role'],
        ['champ inconnu', { role: 'PLAYER', permissions: 15 }, 'permissions']
    ])('400 : %s', async (_label, body, field) => {
        const ctx = buildTestApp()
        const admin = await signIn(ctx, 'admin', 'ADMIN')
        const bob = await signIn(ctx, 'bob')

        const response = await request(ctx.app)
            .put(`/api/v1/admin/accounts/${bob.id}/role`)
            .set(auth(admin.token))
            .send(body)

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }])
    })
})
