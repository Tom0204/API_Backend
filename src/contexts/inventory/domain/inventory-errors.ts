import { DomainError } from '../../../shared/domain/domain-error'

/** Erreurs du contexte inventory (conventions.md §6). */
export const inventoryErrors = {
    /**
     * Personnage de l'URL inexistant ou d'un autre joueur (conventions.md §5 : 404).
     * Même code et même message que l'erreur du contexte characters.
     */
    characterNotFound: () => new DomainError('CHARACTER_NOT_FOUND', 'NOT_FOUND', 'Character not found')
}
