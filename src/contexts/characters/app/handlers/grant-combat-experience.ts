import type { EventHandler } from '../../../../shared/app/event-publisher'
import type { DomainEvent } from '../../../../shared/domain/domain-event'
import type { ExperienceGranted } from '../../domain/character-events'
import type { CharacterRepository } from '../interfaces/character-repository'
import { isCombatWon } from '../interfaces/combat-won'
import type { MonsterExperience } from '../interfaces/monster-experience'

type Transaction = { characters: CharacterRepository; monsterExperience: MonsterExperience }

/** `CombatWon` → XP fixe du monstre (rules.md §5, §7), puis `ExperienceGranted` et `CharacterLeveledUp`. */
export function createGrantCombatExperience(): EventHandler<Transaction> {
    return {
        name: 'characters.grantCombatExperience',
        eventTypes: ['CombatWon'],
        async handle(event, { characters, monsterExperience }): Promise<readonly DomainEvent[]> {
            if (!isCombatWon(event)) throw new Error(`Événement inattendu : ${event.type}`)
            const amount = await monsterExperience.experienceFor(event.monsterId)
            if (amount === undefined) throw new Error(`Monstre introuvable : ${event.monsterId}`) // clé étrangère → 500

            // Verrou sur le personnage, pris après celui du combat (l'action qui publie a verrouillé le combat).
            const character = await characters.findByIdForUpdate(event.characterId)
            if (!character) throw new Error(`Personnage introuvable : ${event.characterId}`)
            const levelsGained = character.gainExperience(amount, event.occurredAt)
            await characters.save(character)

            const { level, experience } = character.snapshot.progression
            const granted: ExperienceGranted = {
                type: 'ExperienceGranted',
                occurredAt: event.occurredAt,
                characterId: character.id,
                combatId: event.combatId,
                amount,
                levelsGained,
                level,
                experience
            }
            return [granted, ...character.pullEvents()]
        }
    }
}
