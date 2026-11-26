import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AppTransaction } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'
import { Account, LOGIN_LOCK_DURATION_MS, MAX_FAILED_LOGIN_ATTEMPTS } from '../../src/contexts/identity/domain/account'
import { Email } from '../../src/contexts/identity/domain/email'
import { ROLES } from '../../src/contexts/identity/domain/permissions'
import { Session } from '../../src/contexts/identity/domain/session'

export interface ContractContext {
    unitOfWork: UnitOfWork<AppTransaction>
    /** Email unique à ce test, dans un domaine que le nettoyage reconnaît. */
    uniqueEmail(): Email
}

/** Même contrat pour les repositories en mémoire et Prisma (AGENTS.md §6), à travers le `UnitOfWork`. */
export function describeIdentityRepositoryContract(name: string, getContext: () => ContractContext) {
    const NOW = new Date('2026-11-25T10:00:00.000Z')
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

        async function insertAccountWithSession(context: ContractContext) {
            const { unitOfWork, uniqueEmail } = context
            const hashes = { accessTokenHash: tokenHash(), refreshTokenHash: tokenHash() }
            const session = await unitOfWork.run(async ({ accounts, sessions }) => {
                const account = await accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash' }))
                return sessions.insert(Session.open({ accountId: account.id, ...hashes, now: NOW }))
            })
            return { session, ...hashes }
        }

        it("insère une session et la retrouve par l'empreinte du jeton d'accès", async () => {
            const { unitOfWork } = getContext()

            const { session, accessTokenHash } = await insertAccountWithSession(getContext())
            const found = await unitOfWork.run(({ sessions }) => sessions.findByAccessTokenHash(accessTokenHash))

            expect(found?.snapshot).toEqual(session.snapshot)
            expect(session.snapshot).toMatchObject({
                accessExpiresAt: new Date('2026-11-25T10:15:00.000Z'),
                expiresAt: new Date('2026-12-02T10:00:00.000Z'),
                revokedAt: null
            })
            expect(await unitOfWork.run(({ sessions }) => sessions.findByAccessTokenHash(tokenHash()))).toBeUndefined()
            expect(await unitOfWork.run(({ sessions }) => sessions.findByIdForUpdate(session.id))).toBeDefined()
            expect(await unitOfWork.run(({ sessions }) => sessions.findByIdForUpdate(randomUUID()))).toBeUndefined()
        })

        it('retrouve la session par son premier jeton de rafraîchissement, non utilisé', async () => {
            const { unitOfWork } = getContext()
            const { session, refreshTokenHash } = await insertAccountWithSession(getContext())

            const found = await unitOfWork.run(({ sessions }) => sessions.findByRefreshTokenHashForUpdate(refreshTokenHash))

            expect(found?.session.snapshot).toEqual(session.snapshot)
            expect(found?.refreshToken.snapshot).toMatchObject({ sessionId: session.id, tokenHash: refreshTokenHash, usedAt: null })
            expect(
                await unitOfWork.run(({ sessions }) => sessions.findByRefreshTokenHashForUpdate(tokenHash()))
            ).toBeUndefined()
        })

        it('enregistre une rotation : nouveau jeton d’accès, ancien jeton consommé, nouveau jeton émis', async () => {
            const { unitOfWork } = getContext()
            const { session, accessTokenHash, refreshTokenHash } = await insertAccountWithSession(getContext())
            const next = { accessTokenHash: tokenHash(), refreshTokenHash: tokenHash() }
            const later = new Date(NOW.getTime() + 60_000)

            await unitOfWork.run(async ({ sessions }) => {
                const found = await sessions.findByRefreshTokenHashForUpdate(refreshTokenHash)
                if (!found) throw new Error('session introuvable')
                found.session.rotate(found.refreshToken, next, later)
                await sessions.save(found.session)
            })

            const old = await unitOfWork.run(({ sessions }) => sessions.findByRefreshTokenHashForUpdate(refreshTokenHash))
            const fresh = await unitOfWork.run(({ sessions }) => sessions.findByRefreshTokenHashForUpdate(next.refreshTokenHash))
            expect(old?.refreshToken.snapshot.usedAt).toEqual(later)
            expect(fresh?.refreshToken.snapshot.usedAt).toBeNull()
            expect(fresh?.session.snapshot).toMatchObject({
                id: session.id,
                accessTokenHash: next.accessTokenHash,
                accessExpiresAt: new Date('2026-11-25T10:16:00.000Z')
            })
            expect(await unitOfWork.run(({ sessions }) => sessions.findByAccessTokenHash(accessTokenHash))).toBeUndefined()
        })

        it('enregistre une révocation ; revokeAllByAccount ne révoque que les sessions actives du compte', async () => {
            const { unitOfWork } = getContext()
            const first = await insertAccountWithSession(getContext())
            const other = await insertAccountWithSession(getContext())
            const accountId = first.session.snapshot.accountId
            const second = await unitOfWork.run(({ sessions }) =>
                sessions.insert(Session.open({ accountId, accessTokenHash: tokenHash(), refreshTokenHash: tokenHash(), now: NOW }))
            )
            const revokedAt = new Date(NOW.getTime() + 1000)

            await unitOfWork.run(async ({ sessions }) => {
                const session = await sessions.findByIdForUpdate(first.session.id)
                if (!session) throw new Error('session introuvable')
                session.revoke(revokedAt)
                await sessions.save(session)
            })
            const count = await unitOfWork.run(({ sessions }) =>
                sessions.revokeAllByAccount(accountId, new Date(NOW.getTime() + 2000))
            )

            const read = (id: string) => unitOfWork.run(({ sessions }) => sessions.findByIdForUpdate(id))
            expect(count).toBe(1)
            expect((await read(first.session.id))?.snapshot.revokedAt).toEqual(revokedAt)
            expect((await read(second.id))?.snapshot.revokedAt).toEqual(new Date(NOW.getTime() + 2000))
            expect((await read(other.session.id))?.snapshot.revokedAt).toBeNull()
        })

        it("refuse une session d'un compte inexistant", async () => {
            const { unitOfWork } = getContext()

            await expect(
                unitOfWork.run(({ sessions }) =>
                    sessions.insert(
                        Session.open({ accountId: randomUUID(), accessTokenHash: tokenHash(), refreshTokenHash: tokenHash(), now: NOW })
                    )
                )
            ).rejects.toThrow()
        })

        it('enregistre le compteur d’échecs et le verrouillage du compte', async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const inserted = await unitOfWork.run(({ accounts }) =>
                accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash' }))
            )
            expect(inserted.snapshot).toMatchObject({ failedLoginCount: 0, lockedUntil: null })

            await unitOfWork.run(async ({ accounts }) => {
                const account = await accounts.findByIdForUpdate(inserted.id)
                if (!account) throw new Error('compte introuvable')
                for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) account.attemptLogin(false, NOW)
                await accounts.save(account)
            })

            const saved = await unitOfWork.run(({ accounts }) => accounts.findById(inserted.id))
            expect(saved?.snapshot).toMatchObject({
                failedLoginCount: MAX_FAILED_LOGIN_ATTEMPTS,
                lockedUntil: new Date(NOW.getTime() + LOGIN_LOCK_DURATION_MS)
            })
            expect(await unitOfWork.run(({ accounts }) => accounts.findByIdForUpdate(randomUUID()))).toBeUndefined()
        })

        it('insère les permissions du compte : joueur par défaut, administrateur si demandé (ROLE-01)', async () => {
            const { unitOfWork, uniqueEmail } = getContext()

            const [player, admin] = await unitOfWork.run(async ({ accounts }) => [
                await accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash' })),
                await accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash', role: 'ADMIN' }))
            ])
            const reread = await unitOfWork.run(({ accounts }) => accounts.findById(admin.id))

            expect(player.permissions.mask).toBe(ROLES.PLAYER)
            expect(player.snapshot.suspendedAt).toBeNull()
            expect(reread?.permissions.mask).toBe(ROLES.ADMIN)
        })

        it('enregistre la suspension, la réactivation et le changement de rôle (ROLE-03)', async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const [admin, target] = await unitOfWork.run(async ({ accounts }) => [
                await accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash', role: 'ADMIN' })),
                await accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash' }))
            ])
            const update = (change: (account: Account) => void) =>
                unitOfWork.run(async ({ accounts }) => {
                    const account = await accounts.findByIdForUpdate(target.id)
                    if (!account) throw new Error('compte introuvable')
                    change(account)
                    await accounts.save(account)
                })
            const reread = () => unitOfWork.run(({ accounts }) => accounts.findById(target.id))

            await update((account) => {
                account.suspend(admin, NOW)
                account.changeRole(admin, 'MODERATOR')
            })
            expect((await reread())?.snapshot).toMatchObject({ suspendedAt: NOW })
            expect((await reread())?.permissions.mask).toBe(ROLES.MODERATOR)

            await update((account) => account.reactivate(admin))
            expect((await reread())?.snapshot.suspendedAt).toBeNull()
        })

        it('liste les comptes du plus ancien au plus récent', async () => {
            const { unitOfWork, uniqueEmail } = getContext()
            const inserted: string[] = []
            for (let i = 0; i < 3; i += 1) {
                const account = await unitOfWork.run(({ accounts }) =>
                    accounts.insert(Account.create({ email: uniqueEmail(), passwordHash: 'hash' }))
                )
                inserted.push(account.id)
            }

            const listed = (await unitOfWork.run(({ accounts }) => accounts.list())).map((account) => account.id)

            expect(listed.filter((id) => inserted.includes(id))).toEqual(inserted)
        })
    })
}
