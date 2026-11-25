import { describe, expect, it } from 'vitest'
import { Combat, type CombatProps } from '../../../../src/domain/combat/combat'
import type { CombatantStats } from '../../../../src/domain/combat/combatant'
import { computeDamage } from '../../../../src/domain/combat/damage'

// Statistiques de rules.md §3 et §8.
const WARRIOR_L1: CombatantStats = { maxHp: 120, attack: 12, defense: 8, speed: 8 }
const WARRIOR_L5: CombatantStats = { maxHp: 168, attack: 20, defense: 16, speed: 12 }
const MAGE_L1: CombatantStats = { maxHp: 80, attack: 10, defense: 4, speed: 10 }
const WOLF: CombatantStats = { maxHp: 40, attack: 8, defense: 2, speed: 9 }
const BOAR: CombatantStats = { maxHp: 60, attack: 10, defense: 5, speed: 6 }
const BANDIT: CombatantStats = { maxHp: 75, attack: 12, defense: 6, speed: 11 }

const NOW = new Date('2026-11-25T12:00:00.000Z')

function startAndRestore(character: CombatantStats, monster: CombatantStats) {
    const { combat, openingTurn } = Combat.start({
        characterId: 'character-1',
        monsterTemplateId: 'monster-1',
        monsterName: 'Monstre',
        character,
        monster,
        now: NOW
    })
    const props: CombatProps = { ...combat, id: 'combat-1', createdAt: NOW }
    return { combat: Combat.restore(props), openingTurn }
}

describe('computeDamage (rules.md §6)', () => {
    it.each([
        ['Guerrier niv. 1 → Loup', 12, 2, 11],
        ['Loup → Guerrier niv. 1', 8, 8, 7],
        ['Guerrier niv. 5 → Bandit', 20, 6, 18],
        ['Attaque 1 → Défense 200 (minimum)', 1, 200, 1]
    ])('%s : %i / %i → %i', (_label, attack, defense, expected) => {
        expect(computeDamage(attack, defense)).toBe(expected)
    })

    it('le niveau 5 du guerrier correspond bien aux statistiques de la classe', () => {
        expect(computeDamage(WARRIOR_L5.attack, BANDIT.defense)).toBe(18)
    })
})

describe('Combat — initiative et alternance', () => {
    it('le plus rapide commence : le loup (9) joue son premier tour avant le guerrier (8)', () => {
        const { combat, openingTurn } = startAndRestore(WARRIOR_L1, WOLF)

        expect(openingTurn).toEqual({ characterDamage: null, monsterDamage: 7 })
        expect(combat.snapshot.character.hp).toBe(113)
        expect(combat.snapshot.monster.hp).toBe(40)
    })

    it('le personnage commence s’il est plus rapide : aucun tour d’ouverture', () => {
        const { combat, openingTurn } = startAndRestore(WARRIOR_L1, BOAR)

        expect(openingTurn).toBeNull()
        expect(combat.snapshot.character.hp).toBe(120)
    })

    it('égalité de vitesse → le personnage commence', () => {
        const { openingTurn } = startAndRestore(MAGE_L1, { ...WOLF, speed: MAGE_L1.speed })

        expect(openingTurn).toBeNull()
    })

    it('chaque attaque du joueur est suivie de la riposte du monstre', () => {
        const { combat } = startAndRestore(WARRIOR_L1, BOAR)

        expect(combat.attack(NOW)).toEqual({ characterDamage: computeDamage(12, 5), monsterDamage: computeDamage(10, 8) })
        expect(combat.snapshot.monster.hp).toBe(60 - 11)
        expect(combat.snapshot.character.hp).toBe(120 - 9)
    })
})

describe('Combat — exemple de référence (rules.md §8)', () => {
    it('guerrier niv. 1 contre loup : VICTORY après 4 actions, 92 PV restants', () => {
        const { combat } = startAndRestore(WARRIOR_L1, WOLF)

        const turns = [combat.attack(NOW), combat.attack(NOW), combat.attack(NOW)]
        expect(turns).toEqual(Array(3).fill({ characterDamage: 11, monsterDamage: 7 }))
        expect(combat.snapshot.status).toBe('IN_PROGRESS')

        expect(combat.attack(NOW)).toEqual({ characterDamage: 11, monsterDamage: null })
        expect(combat.snapshot).toMatchObject({ status: 'VICTORY', finishedAt: NOW })
        expect(combat.snapshot.character.hp).toBe(92)
        expect(combat.snapshot.monster.hp).toBe(0)
    })
})

describe('Combat — défaite et états terminaux', () => {
    it('mage niv. 1 contre bandit : DEFEAT après 7 actions, PV bornés à 0', () => {
        const { combat } = startAndRestore(MAGE_L1, BANDIT)

        for (let i = 0; i < 6; i += 1) combat.attack(NOW)
        expect(combat.snapshot.status).toBe('IN_PROGRESS')

        expect(combat.attack(NOW)).toEqual({ characterDamage: 9, monsterDamage: 11 })
        expect(combat.snapshot).toMatchObject({ status: 'DEFEAT', finishedAt: NOW })
        expect(combat.snapshot.character.hp).toBe(0)
        expect(combat.snapshot.monster.hp).toBe(75 - 7 * 9)
    })

    it('défaite dès le tour d’ouverture du monstre', () => {
        const { combat, openingTurn } = startAndRestore({ maxHp: 5, attack: 1, defense: 0, speed: 1 }, BANDIT)

        expect(openingTurn).toEqual({ characterDamage: null, monsterDamage: 12 })
        expect(combat.snapshot).toMatchObject({ status: 'DEFEAT', finishedAt: NOW })
        expect(combat.snapshot.character.hp).toBe(0)
    })

    it.each(['VICTORY', 'DEFEAT'])('action sur un combat %s → COMBAT_FINISHED, état inchangé', (status) => {
        const { combat } = status === 'VICTORY' ? startAndRestore(WARRIOR_L1, WOLF) : startAndRestore(MAGE_L1, BANDIT)
        while (!combat.isFinished) combat.attack(NOW)
        const before = combat.snapshot

        expect(() => combat.attack(NOW)).toThrow(expect.objectContaining({ code: 'COMBAT_FINISHED', kind: 'RULE_VIOLATION' }))
        expect(combat.snapshot).toBe(before)
    })

    it('les statistiques figées ne changent pas pendant le combat', () => {
        const { combat } = startAndRestore(WARRIOR_L1, WOLF)
        combat.attack(NOW)

        expect(combat.snapshot.character.stats).toEqual(WARRIOR_L1)
        expect(combat.snapshot.monster.stats).toEqual(WOLF)
    })
})
