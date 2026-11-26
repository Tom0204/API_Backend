import { Account } from '../../contexts/identity/domain/account'
import { Email } from '../../contexts/identity/domain/email'
import { NewPassword } from '../../contexts/identity/domain/password'
import type { PasswordHasher } from '../../contexts/identity/app/interfaces/password-hasher'
import type { PrismaClient } from '../../generated/prisma/client'

export interface AdminSeedConfig {
    email: Email
    password: NewPassword
}

/**
 * Premier administrateur (ROLE-01, L7 D9) : `ADMIN_EMAIL` et `ADMIN_PASSWORD`, jamais en dur. Les deux absents :
 * aucun administrateur. Un seul des deux, ou une valeur invalide : erreur. Les messages ne citent jamais les valeurs.
 */
export function readAdminSeedConfig(env: NodeJS.ProcessEnv): AdminSeedConfig | undefined {
    const rawEmail = env.ADMIN_EMAIL ?? ''
    const rawPassword = env.ADMIN_PASSWORD ?? ''
    if (rawEmail === '' && rawPassword === '') return undefined
    if (rawEmail === '' || rawPassword === '') {
        throw new Error('ADMIN_EMAIL et ADMIN_PASSWORD doivent être fournis ensemble')
    }

    let email: Email
    try {
        email = Email.create(rawEmail)
    } catch {
        throw new Error('ADMIN_EMAIL invalide')
    }
    let password: NewPassword
    try {
        password = NewPassword.create(rawPassword)
    } catch {
        throw new Error('ADMIN_PASSWORD invalide : longueur hors de la politique des mots de passe')
    }
    return { email, password }
}

/**
 * Crée le compte administrateur s'il n'existe pas ; un compte existant n'est jamais modifié (ni mot de passe, ni rôle).
 * Idempotent : `upsert` sans mise à jour, sûr même si deux seeds s'exécutent en même temps.
 */
export async function seedAdminAccount(
    prisma: PrismaClient,
    config: AdminSeedConfig,
    passwordHasher: PasswordHasher
): Promise<'created' | 'unchanged'> {
    const existing = await prisma.account.findUnique({ where: { email: config.email.value }, select: { id: true } })
    if (existing) return 'unchanged'

    const admin = Account.create({
        email: config.email,
        passwordHash: await passwordHasher.hash(config.password.value),
        role: 'ADMIN'
    })
    await prisma.account.upsert({
        where: { email: admin.email.value },
        update: {},
        create: { email: admin.email.value, passwordHash: admin.passwordHash, permissions: admin.permissions.mask }
    })
    return 'created'
}
