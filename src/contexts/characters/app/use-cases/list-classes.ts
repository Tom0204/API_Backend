import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import type { StatBlock } from '../../domain/stats'
import type { CharacterClassRepository } from '../interfaces/character-class-repository'

export interface StatValues {
    hp: number
    mana: number
    attack: number
    defense: number
    speed: number
}

/** Classe jouable : statistiques de niveau 1 et gain par niveau (rules.md §3). */
export interface ClassOutput {
    id: string
    code: string
    name: string
    baseStats: StatValues
    statsPerLevel: StatValues
}

type Transaction = { classes: CharacterClassRepository }

/** Lecture simple des données de référence : aucun agrégat, aucun droit (route publique). */
export function createListClasses({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: (): Promise<ClassOutput[]> =>
            unitOfWork.run(async ({ classes }) =>
                (await classes.findAll()).map((characterClass) => {
                    const { id, code, name, base, perLevel } = characterClass.snapshot
                    return { id, code, name, baseStats: statValues(base), statsPerLevel: statValues(perLevel) }
                })
            )
    }
}

function statValues({ hp, mana, attack, defense, speed }: StatBlock): StatValues {
    return { hp, mana, attack, defense, speed }
}

export type ListClasses = ReturnType<typeof createListClasses>
