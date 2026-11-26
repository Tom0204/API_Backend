import type { GetCurrentAccount } from '../app/use-cases/get-current-account'
import type { Login } from '../app/use-cases/login'
import type { RegisterAccount } from '../app/use-cases/register-account'
import { asyncHandler } from '../../../platform/http/async-handler'
import { success } from '../../../platform/http/http-response'
import { getAuth } from '../../../platform/http/request-auth'
import { presentAccount, presentSession } from './account.presenter'
import type { loginBody, registerBody } from './auth.schemas'
import type { z } from 'zod'

export interface AuthUseCases {
    registerAccount: RegisterAccount
    login: Login
    getCurrentAccount: GetCurrentAccount
}

/** Lire, appeler, présenter : aucune règle métier. Le corps est déjà validé par `validate`. */
export function createAuthController({ registerAccount, login, getCurrentAccount }: AuthUseCases) {
    return {
        register: asyncHandler(async (req, res) => {
            const body: z.infer<typeof registerBody> = req.body
            const account = await registerAccount.execute(body)
            res.status(201).json(success('Account created successfully', presentAccount(account)))
        }),

        login: asyncHandler(async (req, res) => {
            const body: z.infer<typeof loginBody> = req.body
            const session = await login.execute(body)
            res.status(200).json(success('Login successful', presentSession(session)))
        }),

        me: asyncHandler(async (req, res) => {
            const account = await getCurrentAccount.execute(getAuth(req))
            res.status(200).json(success('Account retrieved successfully', presentAccount(account)))
        })
    }
}
