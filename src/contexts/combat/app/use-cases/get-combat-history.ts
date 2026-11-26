import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { CombatStatus } from '../../domain/combat'
import type { CombatFighters } from '../interfaces/combat-fighters'
import type { CombatJournal, PlayedTurn } from '../interfaces/combat-journal'
import type { CombatRepository } from '../interfaces/combat-repository'
import { ensureCombatOwnedBy } from '../utils/find-owned-combat'

export interface CombatTurnOutput extends PlayedTurn {
    /** Position du coup dans le combat, à partir de 1. */
    number: number
}

/** Historique d'un combat (PROD-01, L8 D2) : uniquement les coups, en cours ou terminé. */
export interface CombatHistoryOutput {
    combatId: string
    status: CombatStatus
    turns: CombatTurnOutput[]
}

type Transaction = {
    combats: CombatRepository
    fighters: Pick<CombatFighters, 'isOwnedBy'>
    combatJournal: CombatJournal
}

export function createGetCombatHistory({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        /** Combat d'un autre joueur = inexistant ; un combat antérieur au journal (L5) n'a aucun coup. */
        execute: ({ accountId, combatId }: { accountId: string; combatId: string }): Promise<CombatHistoryOutput> =>
            unitOfWork.run(async ({ combats, fighters, combatJournal }) => {
                const combat = await ensureCombatOwnedBy(await combats.findById(combatId), fighters, accountId)
                const turns = await combatJournal.turnsOf(combat.id)
                return {
                    combatId: combat.id,
                    status: combat.snapshot.status,
                    turns: turns.map(({ attacker, damage, characterHp, monsterHp }, index) => ({
                        number: index + 1,
                        attacker,
                        damage,
                        characterHp,
                        monsterHp
                    }))
                }
            })
    }
}

export type GetCombatHistory = ReturnType<typeof createGetCombatHistory>
