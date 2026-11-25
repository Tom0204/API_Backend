import { characterErrors } from '../../domain/characters/character-errors'
import { Stats } from '../../domain/characters/stats'
import { Combat, type TurnResult } from '../../domain/combat/combat'
import { combatErrors } from '../../domain/combat/combat-errors'
import type { Clock } from '../ports/clock'
import type { UnitOfWork } from '../ports/unit-of-work'
import type { VictoryRewards } from './grant-victory-rewards'

export interface StartCombatCommand {
    accountId: string // tiré du jeton
    characterId: string
    monsterId: string
}

export interface CombatTurnView {
    combat: Combat
    /** Dégâts de la requête ; `null` si personne n'a encore joué. */
    lastTurn: TurnResult | null
    /** Récompenses de la victoire ; `null` hors de l'action finale victorieuse (L4 D2). */
    rewards: VictoryRewards | null
}

export function createStartCombat({ unitOfWork, clock }: { unitOfWork: UnitOfWork; clock: Clock }) {
    return {
        execute: (command: StartCombatCommand): Promise<CombatTurnView> =>
            unitOfWork.run(async ({ characters, classes, world, combats }) => {
                // Verrou sur le personnage : deux démarrages simultanés s'exécutent l'un après l'autre.
                const character = await characters.findByIdForUpdate(command.characterId)
                if (!character?.isOwnedBy(command.accountId)) throw characterErrors.notFoundInBody()

                const { classId, zoneId, progression } = character.snapshot
                const monster = await world.findMonsterById(command.monsterId)
                if (!monster?.livesIn(zoneId)) throw combatErrors.monsterNotInZone()

                if (await combats.hasInProgressForCharacter(character.id)) throw combatErrors.alreadyInCombat()

                const characterClass = await classes.findById(classId)
                if (!characterClass) throw new Error(`Classe introuvable pour le personnage ${character.id}`)
                const stats = Stats.forLevel(characterClass, progression.level)

                const { combat, openingTurn } = Combat.start({
                    characterId: character.id,
                    monsterTemplateId: monster.id,
                    monsterName: monster.snapshot.name,
                    character: { maxHp: stats.hp, attack: stats.attack, defense: stats.defense, speed: stats.speed },
                    monster: monster.combatStats,
                    now: clock.now()
                })
                return { combat: await combats.insert(combat), lastTurn: openingTurn, rewards: null }
            })
    }
}

export type StartCombat = ReturnType<typeof createStartCombat>
