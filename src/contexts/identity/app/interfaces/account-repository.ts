import type { Account, NewAccount } from '../../domain/account'
import type { Email } from '../../domain/email'

export interface AccountRepository {
    findById(id: string): Promise<Account | undefined>
    /** Verrouille la ligne du compte jusqu'à la fin de la transaction (compteur d'échecs de connexion). */
    findByIdForUpdate(id: string): Promise<Account | undefined>
    findByEmail(email: Email): Promise<Account | undefined>
    /** Lève `EMAIL_ALREADY_USED` si l'email existe déjà, y compris lors d'inscriptions simultanées. */
    insert(account: NewAccount): Promise<Account>
    /** Enregistre l'état de connexion (compteur d'échecs, verrouillage). */
    save(account: Account): Promise<void>
}
