import type { Clock } from '../../src/application/ports/clock'
import type { PasswordHasher } from '../../src/application/ports/password-hasher'
import type { RandomSource } from '../../src/application/ports/random-source'
import type { TokenGenerator } from '../../src/application/ports/token-generator'

/** Hachage instantané et lisible, qui compte les vérifications (égalisation des délais, D7). */
export class FakePasswordHasher implements PasswordHasher {
    verifyCalls = 0

    async hash(plainPassword: string): Promise<string> {
        return `hashed:${plainPassword}`
    }

    async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
        this.verifyCalls += 1
        return passwordHash === `hashed:${plainPassword}`
    }
}

/** Jetons prévisibles ; l'empreinte reste distincte du jeton pour vérifier qu'il n'est jamais stocké. */
export class FakeTokenGenerator implements TokenGenerator {
    private counter = 0

    generate(): string {
        this.counter += 1
        return `token-${this.counter}`
    }

    hash(token: string): string {
        return `sha256(${token})`
    }
}

/** Tirage forcé (rules.md §7 : 0,31 → objet du loup, 0,9 → rien) ; compte les tirages. */
export class FixedRandom implements RandomSource {
    draws = 0

    constructor(public value = 0.9) {}

    next(): number {
        this.draws += 1
        return this.value
    }
}

/** Horloge de test : fixe, avancée à la main. */
export class FixedClock implements Clock {
    constructor(private current = new Date('2026-11-25T10:00:00.000Z')) {}

    now(): Date {
        return new Date(this.current)
    }

    advance(milliseconds: number): void {
        this.current = new Date(this.current.getTime() + milliseconds)
    }
}
