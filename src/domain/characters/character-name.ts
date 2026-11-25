import { CHARACTER_NAME_PATTERN } from '../shared/game-rules'

export class CharacterName {
    private constructor(readonly value: string) {}

    /** Le format est déjà vérifié par Zod en HTTP ; ici, il protège le domaine quel que soit l'appelant. */
    static create(raw: string): CharacterName {
        if (!CHARACTER_NAME_PATTERN.test(raw)) {
            throw new Error(`Nom de personnage invalide : ${raw}`) // invariant violé → 500
        }
        return new CharacterName(raw)
    }

    /** Forme comparée pour l'unicité, sans tenir compte de la casse (rules.md §4). */
    get normalized(): string {
        return this.value.toLowerCase()
    }
}
