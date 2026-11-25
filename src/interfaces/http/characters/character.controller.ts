import type { z } from 'zod'
import type { CreateCharacter } from '../../../application/characters/create-character'
import type { GetCharacterStats } from '../../../application/characters/get-character-stats'
import type { GetMyCharacter } from '../../../application/characters/get-my-character'
import type { ListMyCharacters } from '../../../application/characters/list-my-characters'
import { asyncHandler } from '../async-handler'
import { success } from '../http-response'
import { getAuth } from '../middlewares/require-auth'
import { presentCharacter, presentCharacterStats } from './character.presenter'
import { characterParams, type createCharacterBody } from './character.schemas'

export interface CharacterUseCases {
    createCharacter: CreateCharacter
    listMyCharacters: ListMyCharacters
    getMyCharacter: GetMyCharacter
    getCharacterStats: GetCharacterStats
}

/** Lire, appeler, présenter : aucune règle métier. Entrées déjà validées par `validate`. */
export function createCharacterController(useCases: CharacterUseCases) {
    return {
        create: asyncHandler(async (req, res) => {
            const body: z.infer<typeof createCharacterBody> = req.body
            const character = await useCases.createCharacter.execute({ accountId: getAuth(req).accountId, ...body })
            res.status(201).json(success('Character created successfully', presentCharacter(character)))
        }),

        list: asyncHandler(async (req, res) => {
            const characters = await useCases.listMyCharacters.execute(getAuth(req))
            res.status(200).json(success('Characters retrieved successfully', characters.map(presentCharacter)))
        }),

        get: asyncHandler(async (req, res) => {
            const { characterId } = characterParams.parse(req.params) // déjà validé : typage sans transtypage
            const character = await useCases.getMyCharacter.execute({ ...getAuth(req), characterId })
            res.status(200).json(success('Character retrieved successfully', presentCharacter(character)))
        }),

        stats: asyncHandler(async (req, res) => {
            const { characterId } = characterParams.parse(req.params) // déjà validé : typage sans transtypage
            const view = await useCases.getCharacterStats.execute({ ...getAuth(req), characterId })
            res.status(200).json(success('Character stats retrieved successfully', presentCharacterStats(view)))
        })
    }
}
