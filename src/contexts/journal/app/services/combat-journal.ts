import type { JsonObject } from '../../domain/game-event-entry'
import type { JournalRepository } from '../interfaces/journal-repository'

/** Coup journalisé (`CombatTurnPlayed`, L5 D4), relu depuis les données de l'entrée. */
export interface JournaledTurn {
    attacker: 'CHARACTER' | 'MONSTER'
    damage: number
    characterHp: number
    monsterHp: number
}

const TURN_TYPE = 'CombatTurnPlayed'

/** Ce que journal offre au combat : ses coups, dans l'ordre d'écriture (PROD-01, L8 D1). */
export function createCombatJournal({ journal }: { journal: JournalRepository }) {
    return {
        async turnsOf(combatId: string): Promise<JournaledTurn[]> {
            const entries = await journal.findByCombat(combatId)
            return entries.filter((entry) => entry.type === TURN_TYPE).map((entry) => toTurn(entry.payload))
        }
    }
}

/** Le journal n'est écrit que par le domaine : une entrée mal formée est une erreur de programmation (→ 500). */
function toTurn(payload: JsonObject): JournaledTurn {
    const { attacker, damage, characterHp, monsterHp } = payload
    if (
        (attacker === 'CHARACTER' || attacker === 'MONSTER') &&
        isCount(damage) &&
        isCount(characterHp) &&
        isCount(monsterHp)
    ) {
        return { attacker, damage, characterHp, monsterHp }
    }
    throw new Error('Entrée CombatTurnPlayed mal formée dans le journal')
}

function isCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
