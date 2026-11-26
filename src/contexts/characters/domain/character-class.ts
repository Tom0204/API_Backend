import type { StatBlock } from './stats'

export interface CharacterClassProps {
    id: string
    code: string
    name: string
    /** Statistiques de niveau 1 (rules.md §3). */
    base: StatBlock
    /** Gain par niveau (rules.md §3). */
    perLevel: StatBlock
}

/** Donnée de référence en lecture seule : aucune route ne la modifie. */
export class CharacterClass {
    private constructor(private readonly props: CharacterClassProps) {}

    static restore(props: CharacterClassProps): CharacterClass {
        return new CharacterClass(props)
    }

    get id(): string {
        return this.props.id
    }

    get base(): StatBlock {
        return this.props.base
    }

    get perLevel(): StatBlock {
        return this.props.perLevel
    }

    get snapshot(): Readonly<CharacterClassProps> {
        return this.props
    }
}
