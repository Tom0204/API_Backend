import { z } from 'zod'

/** Le client transmet une intention : personnage et monstre visés, jamais de statistique. */
export const startCombatBody = z.strictObject({
    characterId: z.uuid('Must be a valid UUID'),
    monsterId: z.uuid('Must be a valid UUID')
})

/** Seule action du MVP (rules.md §6). */
export const combatActionBody = z.strictObject({
    type: z.literal('ATTACK', 'Must be ATTACK')
})

export const combatParams = z.strictObject({
    combatId: z.uuid('Must be a valid UUID')
})
