import type { CharacterName } from './character-name'
import { Progression } from './progression'

export interface CharacterProps {
    id: string
    accountId: string
    classId: string
    zoneId: string
    name: CharacterName
    progression: Progression // niveau + XP dans le niveau (rules.md §5)
    createdAt: Date
}

/** Personnage à insérer : l'identifiant et la date sont attribués par la base. */
export type NewCharacter = Omit<CharacterProps, 'id' | 'createdAt'>

export class Character {
    private constructor(private props: CharacterProps) {}

    /** Création : niveau 1, XP 0, zone de départ (rules.md §4). */
    static create(input: { accountId: string; classId: string; startingZoneId: string; name: CharacterName }): NewCharacter {
        return {
            accountId: input.accountId,
            classId: input.classId,
            zoneId: input.startingZoneId,
            name: input.name,
            progression: Progression.initial()
        }
    }

    static restore(props: CharacterProps): Character {
        return new Character(props)
    }

    get id(): string {
        return this.props.id
    }

    isOwnedBy(accountId: string): boolean {
        return this.props.accountId === accountId
    }

    /** Seule façon de modifier l'XP : aucune route ne l'expose (rules.md §5). */
    gainExperience(amount: number): number {
        const { progression, levelsGained } = this.props.progression.gain(amount)
        this.props = { ...this.props, progression }
        return levelsGained
    }

    get snapshot(): Readonly<CharacterProps> {
        return this.props
    }
}
