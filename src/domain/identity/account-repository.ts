import type { Account, NewAccount } from './account'
import type { Email } from './email'

export interface AccountRepository {
    findById(id: string): Promise<Account | undefined>
    findByEmail(email: Email): Promise<Account | undefined>
    /** Lève `EMAIL_ALREADY_USED` si l'email existe déjà, y compris lors d'inscriptions simultanées. */
    insert(account: NewAccount): Promise<Account>
}
