export interface ZoneProps {
    id: string
    code: string
    name: string
    minLevel: number
    maxLevel: number
}

/** Donnée de référence (rules.md §8), en lecture seule. */
export class Zone {
    private constructor(private readonly props: ZoneProps) {}

    static restore(props: ZoneProps): Zone {
        return new Zone(props)
    }

    get id(): string {
        return this.props.id
    }

    get snapshot(): Readonly<ZoneProps> {
        return this.props
    }
}
