import { Stats } from '../../domain/stats'
import type { CharacterClassRepository } from '../interfaces/character-class-repository'
import type { CharacterRepository } from '../interfaces/character-repository'

/**
 * Ce que characters offre au combat. Aucun import du contexte combat : la forme renvoyée correspond à son
 * contrat (`CombatFighters`) par typage structurel, vérifié à l'assemblage (`platform/transaction.ts`).
 * L'XP de victoire passe par l'événement `CombatWon` (handlers/grant-combat-experience.ts).
 */
export function createCombatFighters({
    characters,
    classes
}: {
    characters: CharacterRepository
    classes: CharacterClassRepository
}) {
    return {
        async lockOwned(characterId: string, accountId: string) {
            // Verrou sur le personnage : deux démarrages simultanés s'exécutent l'un après l'autre.
            const character = await characters.findByIdForUpdate(characterId)
            if (!character?.isOwnedBy(accountId)) return undefined

            const { classId, zoneId, progression } = character.snapshot
            const characterClass = await classes.findById(classId)
            if (!characterClass) throw new Error(`Classe introuvable pour le personnage ${character.id}`)
            const stats = Stats.forLevel(characterClass, progression.level)
            return {
                id: character.id,
                zoneId,
                stats: { maxHp: stats.hp, attack: stats.attack, defense: stats.defense, speed: stats.speed }
            }
        },

        async isOwnedBy(characterId: string, accountId: string) {
            return (await characters.findById(characterId))?.isOwnedBy(accountId) === true
        }
    }
}
