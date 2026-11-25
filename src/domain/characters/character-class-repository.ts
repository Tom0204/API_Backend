import type { CharacterClass } from './character-class'

export interface CharacterClassRepository {
    findById(id: string): Promise<CharacterClass | undefined>
    /** Toutes les classes, triées par nom. */
    findAll(): Promise<CharacterClass[]>
}
