import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

async function setup() {
    const built = buildTestApp()
    const { app, database } = built
    const tokenFor = async (email: string): Promise<string> => {
        await request(app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD })
        return (await request(app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD })).body.data.accessToken
    }
    const alice = await tokenFor('alice@example.com')
    const bob = await tokenFor('bob@example.com')
    const create = (token: string, name: string) =>
        request(app)
            .post('/api/v1/characters')
            .set('Authorization', `Bearer ${token}`)
            .send({ name, classId: database.classId('warrior') })
    /** Progression posée directement dans le faux : aucune route ne modifie niveau ou XP (rules.md §5). */
    const setProgression = (name: string, level: number, experience: number) => {
        const record = database.state.characters.find((character) => character.name === name)
        if (!record) throw new Error(`personnage absent : ${name}`)
        Object.assign(record, { level, experience })
    }
    const leaderboard = (query = '', token = alice) =>
        request(app).get(`/api/v1/leaderboard${query}`).set('Authorization', `Bearer ${token}`)
    return { ...built, alice, bob, create, setProgression, leaderboard }
}

describe('GET /api/v1/leaderboard', () => {
    it('200 : tous les comptes, triés par niveau puis XP, égalité → le plus ancien ; aucun identifiant', async () => {
        const ctx = await setup()
        for (const [token, name] of [[ctx.alice, 'Thrall'], [ctx.bob, 'Jaina'], [ctx.alice, 'Varian'], [ctx.bob, 'Sylvanas']] as const) {
            await ctx.create(token, name)
        }
        ctx.setProgression('Thrall', 3, 7)
        ctx.setProgression('Jaina', 3, 20)
        ctx.setProgression('Varian', 3, 7) // égalité avec Thrall, créé après lui
        ctx.setProgression('Sylvanas', 10, 0)
        const warrior = ctx.database.classId('warrior')

        const response = await ctx.leaderboard()

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            success: true,
            message: 'Leaderboard retrieved successfully',
            data: [
                { rank: 1, name: 'Sylvanas', classId: warrior, level: 10, experience: 0 },
                { rank: 2, name: 'Jaina', classId: warrior, level: 3, experience: 20 },
                { rank: 3, name: 'Thrall', classId: warrior, level: 3, experience: 7 },
                { rank: 4, name: 'Varian', classId: warrior, level: 3, experience: 7 }
            ]
        })
    })

    it('pagination : limit et offset, rang absolu, page au-delà de la fin → []', async () => {
        const ctx = await setup()
        for (const name of ['Thrall', 'Jaina', 'Varian']) await ctx.create(ctx.alice, name)

        const page = await ctx.leaderboard('?limit=1&offset=1')
        const beyond = await ctx.leaderboard('?offset=3')

        expect(page.body.data).toEqual([expect.objectContaining({ rank: 2, name: 'Jaina' })])
        expect(beyond.status).toBe(200)
        expect(beyond.body.data).toEqual([])
    })

    it('liste vide → 200 avec []', async () => {
        const ctx = await setup()

        const response = await ctx.leaderboard()

        expect(response.status).toBe(200)
        expect(response.body.data).toEqual([])
    })

    it.each([
        ['paramètre inconnu', '?page=2', 'page'],
        ['limit à 0', '?limit=0', 'limit'],
        ['limit au-delà de 100', '?limit=101', 'limit'],
        ['limit non entier', '?limit=2.5', 'limit'],
        ['offset négatif', '?offset=-1', 'offset'],
        ['offset répété', '?offset=1&offset=2', 'offset']
    ])('400 : %s', async (_label, query, field) => {
        const ctx = await setup()

        const response = await ctx.leaderboard(query)

        expect(response.status).toBe(400)
        expect(response.body.error).toEqual({ code: 'VALIDATION_ERROR', details: [{ field, message: expect.any(String) }] })
    })

    it('401 sans jeton', async () => {
        const ctx = await setup()

        const response = await request(ctx.app).get('/api/v1/leaderboard')

        expect(response.status).toBe(401)
        expect(response.body.error.code).toBe('UNAUTHENTICATED')
    })
})
