import { describe, expect, it } from 'vitest'
import { isCombatWon as charactersAcceptsCombatWon } from '../../../src/contexts/characters/app/interfaces/combat-won'
import type { CharacterCreated, CharacterLeveledUp, ExperienceGranted } from '../../../src/contexts/characters/domain/character-events'
import { isExperienceGranted, isLootAwarded } from '../../../src/contexts/combat/app/interfaces/reward-events'
import type { CombatEvent } from '../../../src/contexts/combat/domain/combat-events'
import { isCombatWon as inventoryAcceptsCombatWon } from '../../../src/contexts/inventory/app/interfaces/combat-won'
import type { LootAwarded } from '../../../src/contexts/inventory/domain/inventory-events'
import { isJournaled, JOURNALED_EVENT_TYPES } from '../../../src/contexts/journal/app/interfaces/journaled-event'

// Contrats entre contextes par le `type` (EVT-01) : chaque contexte émetteur déclare ses événements, chaque contexte
// récepteur la forme qu'il attend. Ce test vérifie que les deux restent compatibles.
const at = new Date('2026-11-26T10:00:00.000Z')
const ids = { combatId: 'combat-1', characterId: 'hero', monsterId: 'wolf' }

const combatEvents: CombatEvent[] = [
    { type: 'CombatStarted', occurredAt: at, ...ids },
    { type: 'CombatTurnPlayed', occurredAt: at, combatId: 'combat-1', characterId: 'hero', attacker: 'MONSTER', damage: 7, characterHp: 113, monsterHp: 40 },
    { type: 'CombatWon', occurredAt: at, ...ids },
    { type: 'CombatLost', occurredAt: at, ...ids }
]
const granted: ExperienceGranted = { type: 'ExperienceGranted', occurredAt: at, characterId: 'hero', combatId: 'combat-1', amount: 25, levelsGained: 0, level: 1, experience: 25 }
const leveled: CharacterLeveledUp = { type: 'CharacterLeveledUp', occurredAt: at, characterId: 'hero', level: 2, levelsGained: 1 }
const created: CharacterCreated = { type: 'CharacterCreated', occurredAt: at, characterId: 'hero', classId: 'warrior', name: 'Thrall' }
const looted: LootAwarded = {
    type: 'LootAwarded',
    occurredAt: at,
    characterId: 'hero',
    combatId: 'combat-1',
    item: { id: 'pelt', code: 'wolf-pelt', name: 'Peau de loup' },
    quantity: 1
}

describe('contrats d’événements entre contextes', () => {
    it('CombatWon émis par combat est accepté par characters et inventory', () => {
        const won = combatEvents.find((e) => e.type === 'CombatWon')
        expect(won && charactersAcceptsCombatWon(won)).toBe(true)
        expect(won && inventoryAcceptsCombatWon(won)).toBe(true)
        expect(combatEvents.filter((e) => e.type !== 'CombatWon').some((e) => charactersAcceptsCombatWon(e))).toBe(false)
    })

    it('ExperienceGranted (characters) et LootAwarded (inventory) sont reconnus par le combat', () => {
        expect(isExperienceGranted(granted)).toBe(true)
        expect(isLootAwarded(looted)).toBe(true)
        expect(isLootAwarded(granted)).toBe(false)
    })

    it('chaque type journalisé est émis par un contexte et reconnu par le journal', () => {
        const emitted = [...combatEvents, granted, leveled, created, looted]

        expect(emitted.map((e) => e.type).sort()).toEqual([...JOURNALED_EVENT_TYPES].sort())
        expect(emitted.every(isJournaled)).toBe(true)
    })
})
