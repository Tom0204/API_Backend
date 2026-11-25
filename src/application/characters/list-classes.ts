import type { CharacterClass } from '../../domain/characters/character-class'
import type { UnitOfWork } from '../ports/unit-of-work'

/** Lecture simple des données de référence : aucun agrégat, aucun droit (route publique). */
export function createListClasses({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        execute: (): Promise<CharacterClass[]> => unitOfWork.run(({ classes }) => classes.findAll())
    }
}

export type ListClasses = ReturnType<typeof createListClasses>
