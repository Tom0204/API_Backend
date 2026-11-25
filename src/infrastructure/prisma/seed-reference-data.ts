import type { PrismaClient } from '../../generated/prisma/client'

/**
 * Données de référence de `docs/rules.md` (§3 classes, §8 monde initial) : seul emplacement de ces valeurs.
 * Idempotent : chaque ligne est identifiée par son `code` et mise à jour si elle existe déjà.
 */
export const CHARACTER_CLASSES = [
    {
        code: 'warrior',
        name: 'Guerrier',
        base: { hp: 120, mana: 20, attack: 12, defense: 8, speed: 8 },
        perLevel: { hp: 12, mana: 2, attack: 2, defense: 2, speed: 1 }
    },
    {
        code: 'mage',
        name: 'Mage',
        base: { hp: 80, mana: 100, attack: 10, defense: 4, speed: 10 },
        perLevel: { hp: 8, mana: 10, attack: 2, defense: 1, speed: 1 }
    },
    {
        code: 'rogue',
        name: 'Voleur',
        base: { hp: 95, mana: 40, attack: 11, defense: 6, speed: 14 },
        perLevel: { hp: 10, mana: 4, attack: 2, defense: 1, speed: 2 }
    }
] as const

export const ZONES = [{ code: 'clearing', name: 'Clairière', minLevel: 1, maxLevel: 3 }] as const

export const ITEMS = [
    { code: 'wolf-pelt', name: 'Peau de loup' },
    { code: 'boar-tusk', name: 'Défense de sanglier' },
    { code: 'bandit-badge', name: 'Insigne de bandit' }
] as const

export const MONSTER_TEMPLATES = [
    {
        code: 'wolf',
        zoneCode: 'clearing',
        name: 'Loup',
        level: 1,
        hp: 40,
        attack: 8,
        defense: 2,
        speed: 9,
        xpReward: 25,
        loot: { itemCode: 'wolf-pelt', chance: 0.5 }
    },
    {
        code: 'boar',
        zoneCode: 'clearing',
        name: 'Sanglier',
        level: 2,
        hp: 60,
        attack: 10,
        defense: 5,
        speed: 6,
        xpReward: 40,
        loot: { itemCode: 'boar-tusk', chance: 0.4 }
    },
    {
        code: 'bandit',
        zoneCode: 'clearing',
        name: 'Bandit',
        level: 3,
        hp: 75,
        attack: 12,
        defense: 6,
        speed: 11,
        xpReward: 60,
        loot: { itemCode: 'bandit-badge', chance: 0.25 }
    }
] as const

export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
    await prisma.$transaction(async (tx) => {
        for (const characterClass of CHARACTER_CLASSES) {
            const data = {
                name: characterClass.name,
                baseHp: characterClass.base.hp,
                baseMana: characterClass.base.mana,
                baseAttack: characterClass.base.attack,
                baseDefense: characterClass.base.defense,
                baseSpeed: characterClass.base.speed,
                hpPerLevel: characterClass.perLevel.hp,
                manaPerLevel: characterClass.perLevel.mana,
                attackPerLevel: characterClass.perLevel.attack,
                defensePerLevel: characterClass.perLevel.defense,
                speedPerLevel: characterClass.perLevel.speed
            }
            await tx.characterClass.upsert({
                where: { code: characterClass.code },
                create: { code: characterClass.code, ...data },
                update: data
            })
        }

        const zoneIds = new Map<string, string>()
        for (const { code, ...data } of ZONES) {
            const zone = await tx.zone.upsert({ where: { code }, create: { code, ...data }, update: data })
            zoneIds.set(code, zone.id)
        }

        const itemIds = new Map<string, string>()
        for (const { code, name } of ITEMS) {
            const item = await tx.item.upsert({ where: { code }, create: { code, name }, update: { name } })
            itemIds.set(code, item.id)
        }

        for (const { code, zoneCode, loot, ...stats } of MONSTER_TEMPLATES) {
            const data = {
                ...stats,
                zoneId: requireId(zoneIds, zoneCode),
                lootItemId: requireId(itemIds, loot.itemCode),
                lootChance: loot.chance
            }
            await tx.monsterTemplate.upsert({ where: { code }, create: { code, ...data }, update: data })
        }
    })
}

function requireId(ids: Map<string, string>, code: string): string {
    const id = ids.get(code)
    if (!id) throw new Error(`Donnée de référence inconnue : ${code}`)
    return id
}
