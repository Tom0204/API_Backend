import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { IN_MEMORY_STARTING_ZONE_ID } from '../fakes/in-memory-unit-of-work'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

async function setup() {
    const built = buildTestApp()
    const { app, database } = built
    const player = async (email: string, name: string, classCode = 'warrior') => {
        await request(app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD })
        const token: string = (await request(app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD })).body.data.token
        const character = await request(app)
            .post('/api/v1/characters')
            .set('Authorization', `Bearer ${token}`)
            .send({ name, classId: database.classId(classCode) })
        return { token, characterId: character.body.data.id as string }
    }
    const alice = await player('alice@example.com', 'Varian')
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
    const start = (token: string, body: object) => request(app).post('/api/v1/combats').set(auth(token)).send(body)
    const act = (token: string, combatId: string, body: object = { type: 'ATTACK' }) =>
        request(app).post(`/api/v1/combats/${combatId}/actions`).set(auth(token)).send(body)
    const get = (token: string, path: string) => request(app).get(path).set(auth(token))
    return { ...built, player, alice, start, act, get }
}

describe('GET /api/v1/zones/:zoneId/monsters', () => {
    it('200 : les 3 monstres de la Clairière, forme D1, sans butin', async () => {
        const ctx = await setup()

        const response = await ctx.get(ctx.alice.token, `/api/v1/zones/${IN_MEMORY_STARTING_ZONE_ID}/monsters`)

        expect(response.status).toBe(200)
        expect(response.body.message).toBe('Monsters retrieved successfully')
        expect(response.body.data).toEqual([
            { id: ctx.database.monsterId('wolf'), code: 'wolf', name: 'Loup', level: 1, stats: { hp: 40, attack: 8, defense: 2, speed: 9 }, xpReward: 25 },
            { id: ctx.database.monsterId('boar'), code: 'boar', name: 'Sanglier', level: 2, stats: { hp: 60, attack: 10, defense: 5, speed: 6 }, xpReward: 40 },
            { id: ctx.database.monsterId('bandit'), code: 'bandit', name: 'Bandit', level: 3, stats: { hp: 75, attack: 12, defense: 6, speed: 11 }, xpReward: 60 }
        ])
    })

    it('404 ZONE_NOT_FOUND, 400 sur un identifiant invalide, 401 sans jeton', async () => {
        const ctx = await setup()

        const unknown = await ctx.get(ctx.alice.token, `/api/v1/zones/${randomUUID()}/monsters`)
        const invalid = await ctx.get(ctx.alice.token, '/api/v1/zones/clearing/monsters')
        const anonymous = await request(ctx.app).get(`/api/v1/zones/${IN_MEMORY_STARTING_ZONE_ID}/monsters`)

        expect(unknown.status).toBe(404)
        expect(unknown.body).toEqual({ success: false, message: 'Zone not found', error: { code: 'ZONE_NOT_FOUND', details: [] } })
        expect(invalid.status).toBe(400)
        expect(anonymous.status).toBe(401)
    })
})

describe('POST /api/v1/combats', () => {
    it('201 : forme D2, statistiques figées, premier tour du loup joué', async () => {
        const ctx = await setup()

        const response = await ctx.start(ctx.alice.token, { characterId: ctx.alice.characterId, monsterId: ctx.database.monsterId('wolf') })

        expect(response.status).toBe(201)
        expect(response.body).toEqual({
            success: true,
            message: 'Combat started successfully',
            data: {
                id: expect.any(String),
                characterId: ctx.alice.characterId,
                monsterId: ctx.database.monsterId('wolf'),
                status: 'IN_PROGRESS',
                character: { hp: 113, maxHp: 120, attack: 12, defense: 8, speed: 8 },
                monster: { name: 'Loup', hp: 40, maxHp: 40, attack: 8, defense: 2, speed: 9 },
                lastTurn: { characterDamage: null, monsterDamage: 7 },
                createdAt: expect.any(String),
                finishedAt: null
            }
        })
    })

    it('400 : statistique ou champ inconnu fourni par le client', async () => {
        const ctx = await setup()

        const response = await ctx.start(ctx.alice.token, {
            characterId: ctx.alice.characterId,
            monsterId: ctx.database.monsterId('wolf'),
            characterHp: 9999
        })

        expect(response.status).toBe(400)
        expect(response.body.error.details).toEqual([{ field: 'characterHp', message: 'Unknown field' }])
    })

    it("422 CHARACTER_NOT_FOUND : personnage d'un autre joueur ou inexistant, réponses identiques", async () => {
        const ctx = await setup()
        const bob = await ctx.player('bob@example.com', 'Thrall')
        const monsterId = ctx.database.monsterId('wolf')

        const other = await ctx.start(ctx.alice.token, { characterId: bob.characterId, monsterId })
        const missing = await ctx.start(ctx.alice.token, { characterId: randomUUID(), monsterId })

        expect(other.status).toBe(422)
        expect(other.body).toEqual(missing.body)
        expect(other.body.error.code).toBe('CHARACTER_NOT_FOUND')
    })

    it('422 MONSTER_NOT_IN_ZONE, 409 CHARACTER_ALREADY_IN_COMBAT, 401 sans jeton', async () => {
        const ctx = await setup()
        const body = { characterId: ctx.alice.characterId, monsterId: ctx.database.monsterId('boar') }

        const unknownMonster = await ctx.start(ctx.alice.token, { ...body, monsterId: randomUUID() })
        await ctx.start(ctx.alice.token, body)
        const second = await ctx.start(ctx.alice.token, body)
        const anonymous = await request(ctx.app).post('/api/v1/combats').send(body)

        expect(unknownMonster.status).toBe(422)
        expect(unknownMonster.body.error.code).toBe('MONSTER_NOT_IN_ZONE')
        expect(second.status).toBe(409)
        expect(second.body.error.code).toBe('CHARACTER_ALREADY_IN_COMBAT')
        expect(anonymous.status).toBe(401)
    })
})

describe('POST /api/v1/combats/:combatId/actions et GET /api/v1/combats/:combatId', () => {
    it('parcours jusqu’à VICTORY (exemple §8), puis 422 COMBAT_FINISHED et PV du personnage au maximum', async () => {
        const ctx = await setup()
        const started = await ctx.start(ctx.alice.token, { characterId: ctx.alice.characterId, monsterId: ctx.database.monsterId('wolf') })
        const combatId: string = started.body.data.id

        for (let i = 0; i < 3; i += 1) {
            const turn = await ctx.act(ctx.alice.token, combatId)
            expect(turn.status).toBe(200)
            expect(turn.body.data.lastTurn).toEqual({ characterDamage: 11, monsterDamage: 7 })
        }
        const final = await ctx.act(ctx.alice.token, combatId)
        const after = await ctx.act(ctx.alice.token, combatId)
        const stats = await ctx.get(ctx.alice.token, `/api/v1/characters/${ctx.alice.characterId}/stats`)

        expect(final.body.message).toBe('Action resolved successfully')
        expect(final.body.data).toMatchObject({
            status: 'VICTORY',
            character: { hp: 92 },
            monster: { hp: 0 },
            lastTurn: { characterDamage: 11, monsterDamage: null },
            finishedAt: expect.any(String)
        })
        expect(after.status).toBe(422)
        expect(after.body).toEqual({ success: false, message: 'Combat is already finished', error: { code: 'COMBAT_FINISHED', details: [] } })
        expect(stats.body.data.stats).toMatchObject({ currentHp: 120, maxHp: 120 })
    })

    it('parcours jusqu’à DEFEAT : mage niveau 1 contre bandit', async () => {
        const ctx = await setup()
        const mage = await ctx.player('jaina@example.com', 'Jaina', 'mage')
        const started = await ctx.start(mage.token, { characterId: mage.characterId, monsterId: ctx.database.monsterId('bandit') })

        let response = await ctx.act(mage.token, started.body.data.id)
        let actions = 1
        while (response.body.data.status === 'IN_PROGRESS') {
            response = await ctx.act(mage.token, started.body.data.id)
            actions += 1
        }

        expect(actions).toBe(7)
        expect(response.body.data).toMatchObject({ status: 'DEFEAT', character: { hp: 0 }, monster: { hp: 12 } })
    })

    it('consultation : état courant, lastTurn null', async () => {
        const ctx = await setup()
        const started = await ctx.start(ctx.alice.token, { characterId: ctx.alice.characterId, monsterId: ctx.database.monsterId('wolf') })
        await ctx.act(ctx.alice.token, started.body.data.id)

        const response = await ctx.get(ctx.alice.token, `/api/v1/combats/${started.body.data.id}`)

        expect(response.status).toBe(200)
        expect(response.body.message).toBe('Combat retrieved successfully')
        expect(response.body.data).toMatchObject({ status: 'IN_PROGRESS', character: { hp: 106 }, monster: { hp: 29 }, lastTurn: null })
    })

    it("combat d'un autre joueur ou inexistant → 404 COMBAT_NOT_FOUND identiques (action et consultation)", async () => {
        const ctx = await setup()
        const bob = await ctx.player('bob@example.com', 'Thrall')
        const started = await ctx.start(bob.token, { characterId: bob.characterId, monsterId: ctx.database.monsterId('wolf') })

        for (const call of [
            (id: string) => ctx.act(ctx.alice.token, id),
            (id: string) => ctx.get(ctx.alice.token, `/api/v1/combats/${id}`)
        ]) {
            const other = await call(started.body.data.id)
            const missing = await call(randomUUID())
            expect(other.status).toBe(404)
            expect(other.body).toEqual(missing.body)
            expect(other.body).toEqual({ success: false, message: 'Combat not found', error: { code: 'COMBAT_NOT_FOUND', details: [] } })
        }
    })

    it.each([
        [{ type: 'FLEE' }, 'type'],
        [{ type: 'ATTACK', damage: 999 }, 'damage'],
        [{}, 'type']
    ])('400 : action invalide %j', async (body, field) => {
        const ctx = await setup()
        const started = await ctx.start(ctx.alice.token, { characterId: ctx.alice.characterId, monsterId: ctx.database.monsterId('wolf') })

        const response = await ctx.act(ctx.alice.token, started.body.data.id, body)

        expect(response.status).toBe(400)
        expect(response.body.error.details.map((d: { field: string }) => d.field)).toEqual([field])
    })

    it('400 sur un combatId invalide, 401 sans jeton', async () => {
        const ctx = await setup()

        expect((await ctx.get(ctx.alice.token, '/api/v1/combats/abc')).status).toBe(400)
        expect((await request(ctx.app).get(`/api/v1/combats/${randomUUID()}`)).status).toBe(401)
        expect((await request(ctx.app).post(`/api/v1/combats/${randomUUID()}/actions`).send({ type: 'ATTACK' })).status).toBe(401)
    })
})
