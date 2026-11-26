import { DomainError } from '../../../shared/domain/domain-error'

/** Erreurs du contexte identity : un code, un statut, un message identiques partout (conventions.md §6). */
export const identityErrors = {
    emailAlreadyUsed: () => new DomainError('EMAIL_ALREADY_USED', 'CONFLICT', 'Email already used'),
    /** Email inconnu et mauvais mot de passe : même erreur, pour ne pas révéler l'existence d'un compte. */
    invalidCredentials: () => new DomainError('INVALID_CREDENTIALS', 'UNAUTHENTICATED', 'Invalid email or password'),
    unauthenticated: () => new DomainError('UNAUTHENTICATED', 'UNAUTHENTICATED', 'Authentication required'),
    /** Permission absente, ou compte cible plus privilégié que l'acteur (L7 D5). */
    forbidden: () => new DomainError('FORBIDDEN', 'FORBIDDEN', 'Insufficient permissions'),
    accountNotFound: () => new DomainError('ACCOUNT_NOT_FOUND', 'NOT_FOUND', 'Account not found'),
    selfAdministrationRefused: () =>
        new DomainError('SELF_ADMINISTRATION_REFUSED', 'RULE_VIOLATION', 'Cannot administer your own account')
}
