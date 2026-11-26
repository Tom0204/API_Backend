import { z } from 'zod'
import { ROLE_NAMES } from '../domain/permissions'

export const accountParams = z.strictObject({ accountId: z.uuid('Must be a valid UUID') })

/** Seuls les rôles nommés sont attribuables (L7 D3) ; un masque brut est refusé. */
export const changeRoleBody = z.strictObject({
    role: z.enum(ROLE_NAMES, `Must be one of ${ROLE_NAMES.join(', ')}`)
})
