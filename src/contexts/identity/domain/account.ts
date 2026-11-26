import type { Email } from './email'

export interface AccountProps {
    id: string
    email: Email
    passwordHash: string
    createdAt: Date
}

/** Données d'un compte à insérer : l'identifiant et la date sont attribués par la base. */
export interface NewAccount {
    email: Email
    passwordHash: string
}

export class Account {
    private constructor(private readonly props: AccountProps) {}

    /** Le mot de passe est déjà haché : le domaine ne voit jamais le mot de passe d'un compte existant. */
    static create(input: NewAccount): NewAccount {
        return { email: input.email, passwordHash: input.passwordHash }
    }

    static restore(props: AccountProps): Account {
        return new Account(props)
    }

    get id(): string {
        return this.props.id
    }

    get snapshot(): Readonly<AccountProps> {
        return this.props
    }
}
