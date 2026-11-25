import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { IN_MEMORY_STARTING_ZONE_ID } from '../fakes/in-memory-unit-of-work'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

type App = ReturnType<typeof buildTestApp>['app']

async function tokenFor(app: App, email: string): Promise<string> {
    await request(app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD })
    const response = await request(app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD })
    return response.body.data.token
}

function setup() {
    const built = buildTestApp()
    const warrior = built.database.classId('warrior')
    const create = (token: string, body: object) =>
        request(built.app).post('/api/v1/characters').set('Authorization', `Bearer ${token}`).send(body)
    const get = (token: string, path: string) => request(built.app).get(path).set('Authorization', `Bearer ${token}`)
    return { ...built, warrior, create, get }
}

describe('GET /api/v1/classes', () => {
    it('public : 3 classes, forme D1, valeurs de rules.md §3, triées par nom', async () => {
        const { app, database } = setup()

        const response = await request(app).get('/api/v1/classes')

        expect(response.status).toBe(200)
        expect(response.body.message).toBe('Classes retrieved successfully')
        expect(response.body.data).toEqual([
            {
                id: database.classId('warrior'),
                code: 'warrior',
                name: 'Guerrier',
                baseStats: { hp: 120, mana: 20, attack: 12, defense: 8, speed: 8 },
                statsPerLevel: { hp: 12, mana: 2, attack: 2, defense: 2, speed: 1 }
            },
            {
                id: database.classId('mage'),
                code: 'mage',
                name: 'Mage',
                baseStats: { hp: 80, mana: 100, attack: 10, defense: 4, speed: 10 },
                statsPerLevel: { hp: 8, mana: 10, attack: 2, defense: 1, speed: 1 }
            },
            {
                id: database.classId('rogue'),
                code: 'rogue',
                name: 'Voleur',
                baseStats: { hp: 95, mana: 40, attack: 11, defense: 6, speed: 14 },
                statsPerLevel: { hp: 10, mana: 4, attack: 2, defense: 1, speed: 2 }
            }
        ])
    })

    it.each(['post', 'put', 'patch', 'delete'] as const)('aucune route d’écriture : %s → 404', async (method) => {
        const { app } = setup()

        const response = await request(app)[method]('/api/v1/classes')

        expect(response.status).toBe(404)
        expect(response.body.error.code).toBe('ROUTE_NOT_FOUND')
    })
})

describe('POST /api/v1/characters', () => {
    it('201 : niveau 1, XP 0, zone de départ, forme D2, propriétaire jamais exposé', async () => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')

        const response = await ctx.create(token, { name: 'Thrall', classId: ctx.warrior })

        expect(response.status).toBe(201)
        expect(response.body).toEqual({
            success: true,
            message: 'Character created successfully',
            data: {
                id: expect.any(String),
                name: 'Thrall',
                classId: ctx.warrior,
                zoneId: IN_MEMORY_STARTING_ZONE_ID,
                level: 1,
                experience: 0,
                createdAt: expect.any(String)
            }
        })
        expect(ctx.database.state.characters[0]?.accountId).toBe(ctx.database.state.accounts[0]?.id)
    })

    it('401 sans jeton', async () => {
        const ctx = setup()

        const response = await request(ctx.app).post('/api/v1/characters').send({ name: 'Thrall', classId: ctx.warrior })

        expect(response.status).toBe(401)
        expect(response.body.error.code).toBe('UNAUTHENTICATED')
    })

    it.each([
        ['valeur calculée par le serveur', { level: 10 }, 'level'],
        ['XP', { experience: 999 }, 'experience'],
        ['propriétaire', { accountId: randomUUID() }, 'accountId']
    ])('400 : %s fourni par le client', async (_label, extra, field) => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')

        const response = await ctx.create(token, { name: 'Thrall', classId: ctx.warrior, ...extra })

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field, message: 'Unknown field' }])
        expect(ctx.database.state.characters).toHaveLength(0)
    })

    it.each([
        ['nom trop court', { name: 'Al' }, 'name'],
        ['nom avec chiffre', { name: 'R2D2' }, 'name'],
        ['nom accentué', { name: 'Élise' }, 'name'],
        ['classId non UUID', { classId: 'warrior' }, 'classId']
    ])('400 : %s', async (_label, override, field) => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')

        const response = await ctx.create(token, { name: 'Thrall', classId: ctx.warrior, ...override })

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }])
    })

    it('422 CLASS_NOT_FOUND', async () => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')

        const response = await ctx.create(token, { name: 'Thrall', classId: randomUUID() })

        expect(response.status).toBe(422)
        expect(response.body).toEqual({
            success: false,
            message: 'Class not found',
            error: { code: 'CLASS_NOT_FOUND', details: [] }
        })
    })

    it('409 CHARACTER_NAME_TAKEN quelle que soit la casse, même pour un autre compte', async () => {
        const ctx = setup()
        await ctx.create(await tokenFor(ctx.app, 'alice@example.com'), { name: 'Thrall', classId: ctx.warrior })

        const response = await ctx.create(await tokenFor(ctx.app, 'bob@example.com'), { name: 'tHRALL', classId: ctx.warrior })

        expect(response.status).toBe(409)
        expect(response.body.error.code).toBe('CHARACTER_NAME_TAKEN')
    })

    it('409 CHARACTER_LIMIT_REACHED au 6e personnage', async () => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')
        for (const name of ['Aaa', 'Bbb', 'Ccc', 'Ddd', 'Eee']) {
            expect((await ctx.create(token, { name, classId: ctx.warrior })).status).toBe(201)
        }

        const response = await ctx.create(token, { name: 'Fff', classId: ctx.warrior })

        expect(response.status).toBe(409)
        expect(response.body.error.code).toBe('CHARACTER_LIMIT_REACHED')
    })
})

describe('GET /api/v1/characters et /:characterId', () => {
    it('liste vide → 200 avec []', async () => {
        const ctx = setup()

        const response = await ctx.get(await tokenFor(ctx.app, 'alice@example.com'), '/api/v1/characters')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({ success: true, message: 'Characters retrieved successfully', data: [] })
    })

    it('isolation : chacun ne voit que ses personnages', async () => {
        const ctx = setup()
        const alice = await tokenFor(ctx.app, 'alice@example.com')
        const bob = await tokenFor(ctx.app, 'bob@example.com')
        await ctx.create(alice, { name: 'Jaina', classId: ctx.warrior })
        await ctx.create(bob, { name: 'Thrall', classId: ctx.warrior })

        const aliceList = await ctx.get(alice, '/api/v1/characters')
        const bobList = await ctx.get(bob, '/api/v1/characters')

        expect(aliceList.body.data.map((c: { name: string }) => c.name)).toEqual(['Jaina'])
        expect(bobList.body.data.map((c: { name: string }) => c.name)).toEqual(['Thrall'])
    })

    it('détail du propriétaire → 200, même forme qu’à la création', async () => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')
        const created = await ctx.create(token, { name: 'Jaina', classId: ctx.warrior })

        const response = await ctx.get(token, `/api/v1/characters/${created.body.data.id}`)

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual(created.body.data)
    })

    it.each(['', '/stats'])("personnage d'un autre joueur ou inexistant → 404 identiques (%s)", async (suffix) => {
        const ctx = setup()
        const bobs = await ctx.create(await tokenFor(ctx.app, 'bob@example.com'), { name: 'Thrall', classId: ctx.warrior })
        const alice = await tokenFor(ctx.app, 'alice@example.com')

        const other = await ctx.get(alice, `/api/v1/characters/${bobs.body.data.id}${suffix}`)
        const missing = await ctx.get(alice, `/api/v1/characters/${randomUUID()}${suffix}`)

        expect(other.status).toBe(404)
        expect(other.body).toEqual(missing.body)
        expect(other.body).toEqual({
            success: false,
            message: 'Character not found',
            error: { code: 'CHARACTER_NOT_FOUND', details: [] }
        })
    })

    it('identifiant non UUID → 400 sur le paramètre', async () => {
        const ctx = setup()

        const response = await ctx.get(await tokenFor(ctx.app, 'alice@example.com'), '/api/v1/characters/abc')

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field: 'characterId', message: 'Must be a valid UUID' }])
    })

    it('401 sans jeton sur la liste, le détail et les statistiques', async () => {
        const ctx = setup()
        const id = randomUUID()

        for (const path of ['/api/v1/characters', `/api/v1/characters/${id}`, `/api/v1/characters/${id}/stats`]) {
            expect((await request(ctx.app).get(path)).status).toBe(401)
        }
    })
})

describe('GET /api/v1/characters/:characterId/stats', () => {
    it('forme D3 : statistiques du niveau, ressources au maximum, XP restante', async () => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')
        const created = await ctx.create(token, { name: 'Valeera', classId: ctx.database.classId('rogue') })

        const response = await ctx.get(token, `/api/v1/characters/${created.body.data.id}/stats`)

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: 'Character stats retrieved successfully',
            data: {
                characterId: created.body.data.id,
                level: 1,
                experience: 0,
                experienceToNextLevel: 100,
                stats: { maxHp: 95, currentHp: 95, maxMana: 40, currentMana: 40, attack: 11, defense: 6, speed: 14 }
            }
        })
    })

    it('niveau 5 : statistiques recalculées (guerrier → 168 PV, 20 d’attaque)', async () => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')
        const created = await ctx.create(token, { name: 'Varian', classId: ctx.warrior })
        const record = ctx.database.state.characters[0]
        if (record) Object.assign(record, { level: 5, experience: 10 })

        const response = await ctx.get(token, `/api/v1/characters/${created.body.data.id}/stats`)

        expect(response.body.data).toMatchObject({
            level: 5,
            experience: 10,
            experienceToNextLevel: 1108,
            stats: { maxHp: 168, currentHp: 168, attack: 20 }
        })
    })

    it('aucune route ne modifie le niveau ou l’XP', async () => {
        const ctx = setup()
        const token = await tokenFor(ctx.app, 'alice@example.com')
        const created = await ctx.create(token, { name: 'Varian', classId: ctx.warrior })
        const path = `/api/v1/characters/${created.body.data.id}`

        for (const method of ['put', 'patch', 'post', 'delete'] as const) {
            const response = await request(ctx.app)[method](path).set('Authorization', `Bearer ${token}`).send({ level: 10 })
            expect(response.status).toBe(404)
        }
        expect(ctx.database.state.characters[0]).toMatchObject({ level: 1, experience: 0 })
    })
})
