import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCreateCharacter } from '../../../../src/contexts/characters/app/use-cases/create-character'
import { createGetCharacterStats } from '../../../../src/contexts/characters/app/use-cases/get-character-stats'
import { createGetLeaderboard } from '../../../../src/contexts/characters/app/use-cases/get-leaderboard'
import { createGetMyCharacter } from '../../../../src/contexts/characters/app/use-cases/get-my-character'
import { createListClasses } from '../../../../src/contexts/characters/app/use-cases/list-classes'
import { createListMyCharacters } from '../../../../src/contexts/characters/app/use-cases/list-my-characters'
import { Account } from '../../../../src/contexts/identity/domain/account'
import { Email } from '../../../../src/contexts/identity/domain/email'
import { IN_MEMORY_STARTING_ZONE_ID, InMemoryDatabase } from '../../../fakes/in-memory-unit-of-work'
import { FixedClock } from '../../../fakes/fake-ports'

function setup() {
    const database = new InMemoryDatabase()
    const deps = { unitOfWork: database, clock: new FixedClock() }
    const createAccount = async (email = `${randomUUID()}@example.com`) =>
        (await database.run(({ accounts }) => accounts.insert(Account.create({ email: Email.create(email), passwordHash: 'h' })))).id
    return {
        database,
        createAccount,
        warrior: database.classId('warrior'),
        listClasses: createListClasses(deps),
        createCharacter: createCreateCharacter({ ...deps, startingZoneId: IN_MEMORY_STARTING_ZONE_ID }),
        listMyCharacters: createListMyCharacters(deps),
        getMyCharacter: createGetMyCharacter(deps),
        getCharacterStats: createGetCharacterStats(deps)
    }
}

describe('GetLeaderboard', () => {
    it('rang = décalage + position ; ni identifiant ni propriétaire en sortie', async () => {
        const ctx = setup()
        const accountId = await ctx.createAccount()
        for (const name of ['Thrall', 'Jaina', 'Varian']) {
            await ctx.createCharacter.execute({ accountId, name, classId: ctx.warrior })
        }
        const getLeaderboard = createGetLeaderboard({ unitOfWork: ctx.database })

        const page = await getLeaderboard.execute({ limit: 2, offset: 1 })

        expect(page).toEqual([
            { rank: 2, name: 'Jaina', classId: ctx.warrior, level: 1, experience: 0 },
            { rank: 3, name: 'Varian', classId: ctx.warrior, level: 1, experience: 0 }
        ])
    })
})

describe('ListClasses', () => {
    it('renvoie les 3 classes triées par nom', async () => {
        const classes = await setup().listClasses.execute()

        expect(classes.map((c) => c.name)).toEqual(['Guerrier', 'Mage', 'Voleur'])
    })
})

describe('CreateCharacter', () => {
    let ctx: ReturnType<typeof setup>
    let accountId: string
    beforeEach(async () => {
        ctx = setup()
        accountId = await ctx.createAccount()
    })

    it('crée un personnage niveau 1, XP 0, dans la zone de départ, pour le compte du jeton', async () => {
        const character = await ctx.createCharacter.execute({ accountId, name: 'Thrall', classId: ctx.warrior })

        expect(character).toMatchObject({ classId: ctx.warrior, zoneId: IN_MEMORY_STARTING_ZONE_ID })
        // Le propriétaire n'est pas exposé en sortie : on le vérifie en base.
        expect(ctx.database.state.characters.find((c) => c.id === character.id)?.accountId).toBe(accountId)
        expect(character.name).toBe('Thrall')
        expect(character).toMatchObject({ level: 1, experience: 0 })
    })

    it('classe inconnue → CLASS_NOT_FOUND (RULE_VIOLATION)', async () => {
        await expect(ctx.createCharacter.execute({ accountId, name: 'Thrall', classId: randomUUID() })).rejects.toMatchObject({
            code: 'CLASS_NOT_FOUND',
            kind: 'RULE_VIOLATION'
        })
    })

    it('nom déjà pris, quelle que soit la casse, même par un autre compte → CHARACTER_NAME_TAKEN', async () => {
        await ctx.createCharacter.execute({ accountId, name: 'Thrall', classId: ctx.warrior })
        const other = await ctx.createAccount()

        await expect(ctx.createCharacter.execute({ accountId: other, name: 'THRALL', classId: ctx.warrior })).rejects.toMatchObject({
            code: 'CHARACTER_NAME_TAKEN',
            kind: 'CONFLICT'
        })
    })

    it('6e personnage → CHARACTER_LIMIT_REACHED', async () => {
        for (const name of ['Aaa', 'Bbb', 'Ccc', 'Ddd', 'Eee']) {
            await ctx.createCharacter.execute({ accountId, name, classId: ctx.warrior })
        }

        await expect(ctx.createCharacter.execute({ accountId, name: 'Fff', classId: ctx.warrior })).rejects.toMatchObject({
            code: 'CHARACTER_LIMIT_REACHED',
            kind: 'CONFLICT'
        })
    })

    it('8 créations simultanées → exactement 5', async () => {
        const names = ['Aaa', 'Bbb', 'Ccc', 'Ddd', 'Eee', 'Fff', 'Ggg', 'Hhh']

        const results = await Promise.allSettled(
            names.map((name) => ctx.createCharacter.execute({ accountId, name, classId: ctx.warrior }))
        )

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
        expect(ctx.database.state.characters).toHaveLength(5)
    })

    it('ordre des contrôles : classe, puis limite, puis nom', async () => {
        for (const name of ['Aaa', 'Bbb', 'Ccc', 'Ddd', 'Eee']) {
            await ctx.createCharacter.execute({ accountId, name, classId: ctx.warrior })
        }

        await expect(ctx.createCharacter.execute({ accountId, name: 'Aaa', classId: randomUUID() })).rejects.toMatchObject({
            code: 'CLASS_NOT_FOUND'
        })
        await expect(ctx.createCharacter.execute({ accountId, name: 'Aaa', classId: ctx.warrior })).rejects.toMatchObject({
            code: 'CHARACTER_LIMIT_REACHED'
        })
    })
})

describe('Consultation des personnages', () => {
    let ctx: ReturnType<typeof setup>
    let alice: string
    let bob: string
    beforeEach(async () => {
        ctx = setup()
        alice = await ctx.createAccount()
        bob = await ctx.createAccount()
    })

    it('liste vide, puis seulement les personnages du compte, du plus ancien au plus récent', async () => {
        expect(await ctx.listMyCharacters.execute({ accountId: alice })).toEqual([])

        await ctx.createCharacter.execute({ accountId: alice, name: 'Jaina', classId: ctx.warrior })
        await ctx.createCharacter.execute({ accountId: bob, name: 'Thrall', classId: ctx.warrior })
        await ctx.createCharacter.execute({ accountId: alice, name: 'Arthas', classId: ctx.warrior })

        const names = (await ctx.listMyCharacters.execute({ accountId: alice })).map((c) => c.name)
        expect(names).toEqual(['Jaina', 'Arthas'])
    })

    it("personnage d'un autre joueur et personnage inexistant → même CHARACTER_NOT_FOUND", async () => {
        const bobs = await ctx.createCharacter.execute({ accountId: bob, name: 'Thrall', classId: ctx.warrior })
        const expected = { code: 'CHARACTER_NOT_FOUND', kind: 'NOT_FOUND', message: 'Character not found' }

        for (const useCase of [ctx.getMyCharacter, ctx.getCharacterStats]) {
            await expect(useCase.execute({ accountId: alice, characterId: bobs.id })).rejects.toMatchObject(expected)
            await expect(useCase.execute({ accountId: alice, characterId: randomUUID() })).rejects.toMatchObject(expected)
        }
    })

    it('statistiques calculées depuis la classe et le niveau', async () => {
        const character = await ctx.createCharacter.execute({ accountId: alice, name: 'Jaina', classId: ctx.database.classId('mage') })

        const { stats } = await ctx.getCharacterStats.execute({ accountId: alice, characterId: character.id })

        expect(stats).toMatchObject({ maxHp: 80, maxMana: 100, attack: 10, defense: 4, speed: 10 })
    })
})
