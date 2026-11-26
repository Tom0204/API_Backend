import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, VALID_PASSWORD } from '../fakes/test-app'

async function setup() {
    const built = buildTestApp()
    const { app, database } = built
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
    const player = async (email: string, name: string, classCode = 'warrior') => {
        await request(app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD })
        const token: string = (await request(app).post('/api/v1/auth/login').send({ email, password: VALID_PASSWORD })).body.data.accessToken
        const character = await request(app).post('/api/v1/characters').set(auth(token)).send({ name, classId: database.classId(classCode) })
        return { token, characterId: character.body.data.id as string }
    }
    /** Combat jusqu'à la fin ; renvoie toutes les réponses d'action. */
    const fight = async (who: { token: string; characterId: string }, monsterCode: string) => {
        const started = await request(app)
            .post('/api/v1/combats')
            .set(auth(who.token))
            .send({ characterId: who.characterId, monsterId: database.monsterId(monsterCode) })
        const responses = []
        let status = 'IN_PROGRESS'
        while (status === 'IN_PROGRESS') {
            const response = await request(app).post(`/api/v1/combats/${started.body.data.id}/actions`).set(auth(who.token)).send({ type: 'ATTACK' })
            responses.push(response)
            status = response.body.data.status
        }
        return { combatId: started.body.data.id as string, responses }
    }
    const inventory = (token: string, characterId: string) =>
        request(app).get(`/api/v1/characters/${characterId}/inventory`).set(auth(token))
    const alice = await player('alice@example.com', 'Varian')
    return { ...built, auth, player, fight, inventory, alice }
}

describe('REWARD-01 — réponse de l’action finale (L4 D2)', () => {
    it('victoire : rewards avec XP, niveaux gagnés et objet ; null sur les autres actions et en consultation', async () => {
        const ctx = await setup()
        ctx.random.value = 0.31

        const { combatId, responses } = await ctx.fight(ctx.alice, 'wolf')
        const final = responses.at(-1)
        const consulted = await request(ctx.app).get(`/api/v1/combats/${combatId}`).set(ctx.auth(ctx.alice.token))

        expect(responses.slice(0, -1).map((r) => r.body.data.rewards)).toEqual([null, null, null])
        expect(final?.status).toBe(200)
        expect(final?.body.data).toMatchObject({ status: 'VICTORY', character: { hp: 92 } })
        expect(final?.body.data.rewards).toEqual({
            experienceGained: 25,
            levelsGained: 0,
            level: 1,
            experience: 25,
            item: { id: ctx.database.item('wolf-pelt').id, code: 'wolf-pelt', name: 'Peau de loup', quantity: 1 }
        })
        expect(consulted.body.data.rewards).toBeNull()
    })

    it('victoire sans butin (tirage 0,9) : item null ; défaite : rewards null', async () => {
        const ctx = await setup()
        const mage = await ctx.player('jaina@example.com', 'Jaina', 'mage')

        const victory = (await ctx.fight(ctx.alice, 'wolf')).responses.at(-1)
        const defeat = (await ctx.fight(mage, 'bandit')).responses.at(-1)

        expect(victory?.body.data.rewards).toMatchObject({ experienceGained: 25, item: null })
        expect(defeat?.body.data).toMatchObject({ status: 'DEFEAT', rewards: null })
    })

    it('le personnage est mis à jour : niveau et XP visibles sur le personnage', async () => {
        const ctx = await setup()

        await ctx.fight(ctx.alice, 'wolf')
        const character = await request(ctx.app).get(`/api/v1/characters/${ctx.alice.characterId}`).set(ctx.auth(ctx.alice.token))

        expect(character.body.data).toMatchObject({ level: 1, experience: 25 })
    })
})

describe('GET /api/v1/characters/:characterId/inventory', () => {
    it('200 [] à la création, puis piles par objet (D3) après deux victoires', async () => {
        const ctx = await setup()
        const empty = await ctx.inventory(ctx.alice.token, ctx.alice.characterId)
        ctx.random.value = 0.31

        await ctx.fight(ctx.alice, 'wolf')
        await ctx.fight(ctx.alice, 'wolf')
        const response = await ctx.inventory(ctx.alice.token, ctx.alice.characterId)

        expect(empty.status).toBe(200)
        expect(empty.body).toEqual({ success: true, message: 'Inventory retrieved successfully', data: [] })
        expect(response.body.data).toEqual([
            { itemId: ctx.database.item('wolf-pelt').id, code: 'wolf-pelt', name: 'Peau de loup', quantity: 2 }
        ])
    })

    it("personnage d'un autre joueur ou inexistant → 404 CHARACTER_NOT_FOUND identiques", async () => {
        const ctx = await setup()
        const bob = await ctx.player('bob@example.com', 'Thrall')
        ctx.random.value = 0.31
        await ctx.fight(bob, 'wolf')

        const other = await ctx.inventory(ctx.alice.token, bob.characterId)
        const missing = await ctx.inventory(ctx.alice.token, randomUUID())

        expect(other.status).toBe(404)
        expect(other.body).toEqual(missing.body)
        expect(other.body).toEqual({ success: false, message: 'Character not found', error: { code: 'CHARACTER_NOT_FOUND', details: [] } })
    })

    it('400 sur un identifiant invalide ou un paramètre inconnu, 401 sans jeton', async () => {
        const ctx = await setup()

        const invalid = await ctx.inventory(ctx.alice.token, 'abc')
        const unknownQuery = await request(ctx.app)
            .get(`/api/v1/characters/${ctx.alice.characterId}/inventory?quantity=99`)
            .set(ctx.auth(ctx.alice.token))
        const anonymous = await request(ctx.app).get(`/api/v1/characters/${ctx.alice.characterId}/inventory`)

        expect(invalid.status).toBe(400)
        expect(unknownQuery.status).toBe(400)
        expect(anonymous.status).toBe(401)
        expect(anonymous.headers['www-authenticate']).toBe('Bearer realm="api"')
    })
})
