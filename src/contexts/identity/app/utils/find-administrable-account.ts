import type { AuthContext } from '../../../../shared/app/auth-context'
import type { Account } from '../../domain/account'
import { identityErrors } from '../../domain/identity-errors'
import type { AccountRepository } from '../interfaces/account-repository'

/** Entrée commune aux actions d'administration : l'acteur (`accountId`, de son jeton) et le compte visé. */
export interface AdministrationInput extends AuthContext {
    targetAccountId: string
}

/**
 * Charge l'acteur, puis verrouille le compte cible jusqu'à la fin de la transaction : une connexion simultanée du
 * compte cible s'exécute avant ou après l'action, jamais entre les deux. Seule la cible est modifiée, l'acteur est lu.
 */
export async function findAdministrableAccount(
    accounts: AccountRepository,
    { accountId, targetAccountId }: AdministrationInput
): Promise<{ actor: Account; target: Account }> {
    const actor = await accounts.findById(accountId)
    // Acteur supprimé entre l'authentification et ici : impossible tant que les comptes ne sont pas supprimés.
    if (!actor) throw identityErrors.unauthenticated()
    const target = await accounts.findByIdForUpdate(targetAccountId)
    if (!target) throw identityErrors.accountNotFound()
    return { actor, target }
}
