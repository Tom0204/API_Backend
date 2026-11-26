import type { GetCurrentAccount } from '../app/use-cases/get-current-account'
import type { Login } from '../app/use-cases/login'
import type { Logout } from '../app/use-cases/logout'
import type { LogoutAll } from '../app/use-cases/logout-all'
import type { RefreshSession } from '../app/use-cases/refresh-session'
import type { RegisterAccount } from '../app/use-cases/register-account'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { getAuth } from '../../../platform/http/request-auth'
import { presentAccount, presentSessionTokens } from './account.presenter'
import type { loginBody, refreshBody, registerBody } from './auth.schemas'
import type { z } from 'zod'

export interface AuthUseCases {
    registerAccount: RegisterAccount
    login: Login
    refreshSession: RefreshSession
    logout: Logout
    logoutAll: LogoutAll
    getCurrentAccount: GetCurrentAccount
}

/** Lire, appeler, présenter : aucune règle métier. Le corps est déjà validé par `validate`. */
export function createAuthController({
    registerAccount,
    login,
    refreshSession,
    logout,
    logoutAll,
    getCurrentAccount
}: AuthUseCases) {
    return {
        register: asyncHandler(async (req, res) => {
            const body: z.infer<typeof registerBody> = req.body
            const account = await registerAccount.execute(body)
            res.status(201).json(success('Account created successfully', presentAccount(account)))
        }),

        login: asyncHandler(async (req, res) => {
            const body: z.infer<typeof loginBody> = req.body
            const tokens = await login.execute(body)
            res.status(200).json(success('Login successful', presentSessionTokens(tokens)))
        }),

        refresh: asyncHandler(async (req, res) => {
            const body: z.infer<typeof refreshBody> = req.body
            const tokens = await refreshSession.execute(body)
            res.status(200).json(success('Session refreshed successfully', presentSessionTokens(tokens)))
        }),

        /** 204 sans corps : seule exception à l'enveloppe (conventions.md §3). */
        logout: asyncHandler(async (req, res) => {
            await logout.execute(getAuth(req))
            res.status(204).end()
        }),

        logoutAll: asyncHandler(async (req, res) => {
            await logoutAll.execute(getAuth(req))
            res.status(204).end()
        }),

        me: asyncHandler(async (req, res) => {
            const account = await getCurrentAccount.execute(getAuth(req))
            res.status(200).json(success('Account retrieved successfully', presentAccount(account)))
        })
    }
}
