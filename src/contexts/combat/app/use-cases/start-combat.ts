import type { Clock } from '../../../../shared/app/clock'
import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { Combat } from '../../domain/combat'
import { combatErrors } from '../../domain/combat-errors'
import type { CombatFighters } from '../interfaces/combat-fighters'
import type { CombatMonsters } from '../interfaces/combat-monsters'
import type { CombatRepository } from '../interfaces/combat-repository'
import { type CombatView, toCombatView } from '../utils/combat-output'

export interface StartCombatInput {
    accountId: string // tiré du jeton
    characterId: string
    monsterId: string
}

type Transaction = {
    combats: CombatRepository
    fighters: Pick<CombatFighters, 'lockOwned'>
    monsters: CombatMonsters
}

export function createStartCombat({ unitOfWork, clock }: { unitOfWork: UnitOfWork<Transaction>; clock: Clock }) {
    return {
        execute: (input: StartCombatInput): Promise<CombatView> =>
            unitOfWork.run(async ({ combats, fighters, monsters }) => {
                // Verrou sur le personnage : deux démarrages simultanés s'exécutent l'un après l'autre.
                const fighter = await fighters.lockOwned(input.characterId, input.accountId)
                if (!fighter) throw combatErrors.characterNotFound()

                const monster = await monsters.findById(input.monsterId)
                if (!monster || monster.zoneId !== fighter.zoneId) throw combatErrors.monsterNotInZone()

                if (await combats.hasInProgressForCharacter(fighter.id)) throw combatErrors.alreadyInCombat()

                const { combat, openingTurn } = Combat.start({
                    characterId: fighter.id,
                    monsterTemplateId: monster.id,
                    monsterName: monster.name,
                    character: fighter.stats,
                    monster: monster.stats,
                    now: clock.now()
                })
                return toCombatView(await combats.insert(combat), openingTurn, null)
            })
    }
}

export type StartCombat = ReturnType<typeof createStartCombat>
