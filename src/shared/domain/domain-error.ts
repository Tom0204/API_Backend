/** Nature d'une erreur métier ; seul le middleware d'erreurs HTTP la traduit en statut. */
export type DomainErrorKind = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RULE_VIOLATION'

export class DomainError extends Error {
    constructor(
        readonly code: string,
        readonly kind: DomainErrorKind,
        message: string
    ) {
        super(message)
        this.name = 'DomainError'
    }
}
