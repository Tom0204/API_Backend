/**
 * Exécute `work` dans une transaction : tout est validé, ou tout est annulé si une erreur est levée.
 * `R` décrit ce que la transaction met à disposition : chaque cas d'usage n'y déclare que ce qu'il utilise
 * (repositories de son contexte et contrats déclarés dans ses `app/interfaces`). L'assemblage (`platform/`)
 * fournit une transaction qui satisfait tous les cas d'usage.
 */
export interface UnitOfWork<R> {
    run<T>(work: (transaction: R) => Promise<T>): Promise<T>
}
