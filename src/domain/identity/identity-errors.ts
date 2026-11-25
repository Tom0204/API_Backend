import { DomainError } from '../shared/domain-error'

/** Erreurs du contexte identity : un code, un statut, un message identiques partout (conventions.md §6). */
export const identityErrors = {
    emailAlreadyUsed: () => new DomainError('EMAIL_ALREADY_USED', 'CONFLICT', 'Email already used'),
    /** Email inconnu et mauvais mot de passe : même erreur, pour ne pas révéler l'existence d'un compte. */
    invalidCredentials: () => new DomainError('INVALID_CREDENTIALS', 'UNAUTHENTICATED', 'Invalid email or password'),
    unauthenticated: () => new DomainError('UNAUTHENTICATED', 'UNAUTHENTICATED', 'Authentication required')
}
