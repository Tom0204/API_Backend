import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AppTransaction } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'
import { Account } from '../../src/contexts/identity/domain/account'
import { Email } from '../../src/contexts/identity/domain/email'
import { Session } from '../../src/contexts/identity/domain/session'

export interface ContractContext {
    unitOfWork: UnitOfWork<AppTransaction>
    /** Email unique à ce test, dans un domaine que le nettoyage reconnaît. */
    uniqueEmail(): Email
}

/** Même contrat pour les repositories en mémoire et Prisma (AGENTS.md §6), à travers le `UnitOfWork`. */
export function describeIdentityRepositoryContract(name: string, getContext: () => ContractContext) {
    const tokenHash = () => randomUUID().replaceAll('-', '').padEnd(64, '0')

    describe(`contrat des repositories identity — ${name}`, () => {
        it('insère un compte puis le retrouve par email et par identifiant', async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const email = uniqueEmail()

            const inserted = await unitOfWork.run(({ accounts }) =>
                accounts.insert(Account.create({ email, passwordHash: 'hash' }))
            )
            const byEmail = await unitOfWork.run(({ accounts }) => accounts.findByEmail(email))
            const byId = await unitOfWork.run(({ accounts }) => accounts.findById(inserted.id))

            expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/)
            expect(inserted.snapshot.createdAt).toBeInstanceOf(Date)
            expect(byEmail?.snapshot).toEqual(inserted.snapshot)
            expect(byId?.snapshot).toEqual(inserted.snapshot)
        })

        it('renvoie undefined pour un compte inexistant', async () => {
            const { unitOfWork, uniqueEmail } = getContext()

            expect(await unitOfWork.run(({ accounts }) => accounts.findByEmail(uniqueEmail()))).toBeUndefined()
            expect(await unitOfWork.run(({ accounts }) => accounts.findById(randomUUID()))).toBeUndefined()
        })

        it('refuse un email déjà utilisé → EMAIL_ALREADY_USED', async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const email = uniqueEmail()
            const insert = () =>
                unitOfWork.run(({ accounts }) => accounts.insert(Account.create({ email, passwordHash: 'hash' })))

            await insert()
            await expect(insert()).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED', kind: 'CONFLICT' })
        })

        it('deux insertions simultanées du même email → une seule réussit', async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const email = uniqueEmail()
            const insert = () =>
                unitOfWork.run(({ accounts }) => accounts.insert(Account.create({ email, passwordHash: 'hash' })))

            const results = await Promise.allSettled([insert(), insert()])

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
            expect(results.find((result) => result.status === 'rejected')).toMatchObject({
                reason: { code: 'EMAIL_ALREADY_USED' }
            })
        })

        it('annule toute la transaction si le travail lève une erreur', async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const email = uniqueEmail()

            await expect(
                unitOfWork.run(async ({ accounts }) => {
                    await accounts.insert(Account.create({ email, passwordHash: 'hash' }))
                    throw new Error('panne injectée')
                })
            ).rejects.toThrow('panne injectée')

            expect(await unitOfWork.run(({ accounts }) => accounts.findByEmail(email))).toBeUndefined()
        })

        it("insère une session et la retrouve par l'empreinte du jeton", async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const hash = tokenHash()

            const session = await unitOfWork.run(async ({ accounts, sessions }) => {
                const account = await accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash' }))
                return sessions.insert(
                    Session.open({ accountId: account.id, tokenHash: hash, now: new Date('2026-11-25T10:00:00.000Z') })
                )
            })
            const found = await unitOfWork.run(({ sessions }) => sessions.findByTokenHash(hash))

            expect(found?.snapshot).toEqual(session.snapshot)
            expect(found?.snapshot.expiresAt.toISOString()).toBe('2026-11-26T10:00:00.000Z')
            expect(await unitOfWork.run(({ sessions }) => sessions.findByTokenHash(tokenHash()))).toBeUndefined()
        })

        it("refuse une session d'un compte inexistant", async () => {
            const { unitOfWork } = getContext()

            await expect(
                unitOfWork.run(({ sessions }) =>
                    sessions.insert(Session.open({ accountId: randomUUID(), tokenHash: tokenHash(), now: new Date() }))
                )
            ).rejects.toThrow()
        })
    })
}
