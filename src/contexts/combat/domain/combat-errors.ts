import { DomainError } from '../../../shared/domain/domain-error'

/** Erreurs du contexte combat (conventions.md §6). */
export const combatErrors = {
    /** Inexistant ou d'un autre joueur : même erreur. */
    notFound: () => new DomainError('COMBAT_NOT_FOUND', 'NOT_FOUND', 'Combat not found'),
    finished: () => new DomainError('COMBAT_FINISHED', 'RULE_VIOLATION', 'Combat is already finished'),
    alreadyInCombat: () =>
        new DomainError('CHARACTER_ALREADY_IN_COMBAT', 'CONFLICT', 'Character is already in combat'),
    /** Monstre inconnu ou absent de la zone du personnage : même erreur. */
    monsterNotInZone: () =>
        new DomainError('MONSTER_NOT_IN_ZONE', 'RULE_VIOLATION', "Monster not found in the character's zone"),
    /**
     * Personnage du corps de la requête inexistant ou d'un autre joueur (conventions.md §5 : 422).
     * Même code et même message que l'erreur 404 du contexte characters.
     */
    characterNotFound: () => new DomainError('CHARACTER_NOT_FOUND', 'RULE_VIOLATION', 'Character not found')
}
