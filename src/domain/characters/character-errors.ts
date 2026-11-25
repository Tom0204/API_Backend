import { DomainError } from '../shared/domain-error'

/** Erreurs du contexte characters (conventions.md §6). */
export const characterErrors = {
    classNotFound: () => new DomainError('CLASS_NOT_FOUND', 'RULE_VIOLATION', 'Class not found'),
    limitReached: () => new DomainError('CHARACTER_LIMIT_REACHED', 'CONFLICT', 'Character limit reached'),
    nameTaken: () => new DomainError('CHARACTER_NAME_TAKEN', 'CONFLICT', 'Character name already taken'),
    /** Inexistant ou d'un autre joueur : même erreur (conventions.md §5). */
    notFound: () => new DomainError('CHARACTER_NOT_FOUND', 'NOT_FOUND', 'Character not found')
}
