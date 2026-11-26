import { describe, expect, it } from 'vitest'
import { readAdminSeedConfig } from '../../../src/platform/prisma/seed-admin'

const PASSWORD = 'correct-horse-battery-staple'

describe('configuration du premier administrateur (ROLE-01, L7 D9)', () => {
    it('aucune variable (ou vides) : aucun administrateur', () => {
        expect(readAdminSeedConfig({})).toBeUndefined()
        expect(readAdminSeedConfig({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' })).toBeUndefined()
    })

    it('les deux variables : email normalisé, mot de passe conforme', () => {
        const config = readAdminSeedConfig({ ADMIN_EMAIL: 'Admin@Example.com', ADMIN_PASSWORD: PASSWORD })

        expect(config?.email.value).toBe('admin@example.com')
        expect(config?.password.value).toBe(PASSWORD)
    })

    it.each([
        [{ ADMIN_EMAIL: 'admin@example.com' }, 'ADMIN_EMAIL et ADMIN_PASSWORD doivent être fournis ensemble'],
        [{ ADMIN_PASSWORD: PASSWORD }, 'ADMIN_EMAIL et ADMIN_PASSWORD doivent être fournis ensemble'],
        [{ ADMIN_EMAIL: 'pas-un-email', ADMIN_PASSWORD: PASSWORD }, 'ADMIN_EMAIL invalide'],
        [{ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'trop-court' }, 'ADMIN_PASSWORD invalide']
    ])('configuration refusée %#, sans jamais citer les valeurs', (env, message) => {
        let error: unknown
        try {
            readAdminSeedConfig(env)
        } catch (caught) {
            error = caught
        }

        expect(error).toBeInstanceOf(Error)
        const text = error instanceof Error ? error.message : ''
        expect(text).toContain(message)
        for (const value of Object.values(env)) expect(text).not.toContain(value)
    })
})
