import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { JournalRepository } from '../../../../src/contexts/journal/app/interfaces/journal-repository'
import { createCombatJournal } from '../../../../src/contexts/journal/app/services/combat-journal'
import type { GameEventEntry, JsonObject } from '../../../../src/contexts/journal/domain/game-event-entry'

/** Journal figé : seule `findByCombat` est utilisée par le service. */
function journalWith(entries: { type: string; payload: JsonObject }[]): JournalRepository {
    const combatId = randomUUID()
    const stored: GameEventEntry[] = entries.map(({ type, payload }) => ({
        type,
        payload,
        characterId: randomUUID(),
        combatId,
        occurredAt: new Date('2026-12-01T10:00:00.000Z')
    }))
    return {
        append: async () => {
            throw new Error('lecture seule')
        },
        findByCharacter: async () => [],
        findByCombat: async () => stored
    }
}

describe('service CombatJournal (PROD-01, L8 D1)', () => {
    it('ne garde que les coups, dans l’ordre du journal', async () => {
        const journal = journalWith([
            { type: 'CombatStarted', payload: { monsterId: randomUUID() } },
            { type: 'CombatTurnPlayed', payload: { attacker: 'MONSTER', damage: 7, characterHp: 113, monsterHp: 40 } },
            { type: 'CombatTurnPlayed', payload: { attacker: 'CHARACTER', damage: 11, characterHp: 113, monsterHp: 29 } },
            { type: 'CombatWon', payload: { monsterId: randomUUID() } }
        ])

        const turns = await createCombatJournal({ journal }).turnsOf(randomUUID())

        expect(turns).toEqual([
            { attacker: 'MONSTER', damage: 7, characterHp: 113, monsterHp: 40 },
            { attacker: 'CHARACTER', damage: 11, characterHp: 113, monsterHp: 29 }
        ])
    })

    it.each([
        ['attaquant inconnu', { attacker: 'HEALER', damage: 7, characterHp: 1, monsterHp: 1 }],
        ['dégâts manquants', { attacker: 'MONSTER', characterHp: 1, monsterHp: 1 }],
        ['PV négatifs', { attacker: 'MONSTER', damage: 7, characterHp: -1, monsterHp: 1 }]
    ])('entrée mal formée (%s) → erreur de programmation', async (_label, payload: JsonObject) => {
        const journal = journalWith([{ type: 'CombatTurnPlayed', payload }])

        await expect(createCombatJournal({ journal }).turnsOf(randomUUID())).rejects.toThrow('mal formée')
    })
})
