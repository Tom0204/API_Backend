import type { Account } from '../../domain/account'

/** Compte vu hors du contexte : jamais le hash du mot de passe. */
export interface AccountOutput {
    id: string
    email: string
    createdAt: Date
}

export function toAccountOutput(account: Account): AccountOutput {
    const { id, email, createdAt } = account.snapshot
    return { id, email: email.value, createdAt }
}
