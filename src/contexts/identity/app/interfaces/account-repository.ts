import type { Account, NewAccount } from '../../domain/account'
import type { Email } from '../../domain/email'

export interface AccountRepository {
    findById(id: string): Promise<Account | undefined>
    /** Verrouille la ligne du compte jusqu'à la fin de la transaction (compteur d'échecs, administration). */
    findByIdForUpdate(id: string): Promise<Account | undefined>
    findByEmail(email: Email): Promise<Account | undefined>
    /** Tous les comptes, du plus ancien au plus récent (`createdAt`, puis `id`) ; sans pagination (L7 D8). */
    list(): Promise<Account[]>
    /** Lève `EMAIL_ALREADY_USED` si l'email existe déjà, y compris lors d'inscriptions simultanées. */
    insert(account: NewAccount): Promise<Account>
    /** Enregistre l'état modifiable : compteur d'échecs, verrouillage, permissions, suspension. */
    save(account: Account): Promise<void>
}
