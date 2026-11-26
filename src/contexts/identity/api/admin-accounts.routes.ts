import { type RequestHandler, Router } from 'express'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { validate } from '../../../platform/http/middlewares/validate'
import { getAuth } from '../../../platform/http/request-auth'
import type { RequiredPermission } from '../app/use-cases/authenticate'
import type { ChangeAccountRole } from '../app/use-cases/change-account-role'
import type { ListAccounts } from '../app/use-cases/list-accounts'
import type { ReactivateAccount } from '../app/use-cases/reactivate-account'
import type { SuspendAccount } from '../app/use-cases/suspend-account'
import { presentAdminAccount } from './admin-account.presenter'
import { accountParams, changeRoleBody } from './admin-accounts.schemas'

export interface AdminAccountUseCases {
    listAccounts: ListAccounts
    suspendAccount: SuspendAccount
    reactivateAccount: ReactivateAccount
    changeAccountRole: ChangeAccountRole
}

/**
 * `/api/v1/admin/accounts` (ROLE-03) : chaque route exige sa propre permission (L7 D1), contrôlée avant la
 * validation. Lire, appeler, présenter : les garde-fous (soi-même, hiérarchie) sont dans le domaine.
 */
export function createAdminAccountRoutes(
    deps: AdminAccountUseCases & { requirePermission: (permission: RequiredPermission) => RequestHandler }
): Router {
    const { requirePermission, listAccounts, suspendAccount, reactivateAccount, changeAccountRole } = deps
    const router = Router()

    router.get(
        '/api/v1/admin/accounts',
        requirePermission('ACCOUNTS_READ'),
        validate({}),
        asyncHandler(async (_req, res) => {
            const accounts = await listAccounts.execute()
            res.status(200).json(success('Accounts retrieved successfully', accounts.map(presentAdminAccount)))
        })
    )

    router.post(
        '/api/v1/admin/accounts/:accountId/suspension',
        requirePermission('ACCOUNTS_SUSPEND'),
        validate({ params: accountParams }),
        asyncHandler(async (req, res) => {
            const { accountId } = accountParams.parse(req.params) // déjà validé : typage sans transtypage
            const account = await suspendAccount.execute({ ...getAuth(req), targetAccountId: accountId })
            res.status(200).json(success('Account suspended successfully', presentAdminAccount(account)))
        })
    )

    router.post(
        '/api/v1/admin/accounts/:accountId/reactivation',
        requirePermission('ACCOUNTS_SUSPEND'),
        validate({ params: accountParams }),
        asyncHandler(async (req, res) => {
            const { accountId } = accountParams.parse(req.params)
            const account = await reactivateAccount.execute({ ...getAuth(req), targetAccountId: accountId })
            res.status(200).json(success('Account reactivated successfully', presentAdminAccount(account)))
        })
    )

    router.put(
        '/api/v1/admin/accounts/:accountId/role',
        requirePermission('ACCOUNTS_MANAGE_ROLES'),
        validate({ params: accountParams, body: changeRoleBody }),
        asyncHandler(async (req, res) => {
            const { accountId } = accountParams.parse(req.params)
            const { role } = changeRoleBody.parse(req.body)
            const account = await changeAccountRole.execute({ ...getAuth(req), targetAccountId: accountId, role })
            res.status(200).json(success('Account role updated successfully', presentAdminAccount(account)))
        })
    )

    return router
}
