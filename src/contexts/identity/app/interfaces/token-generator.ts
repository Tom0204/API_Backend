/** Jetons de session opaques. */
export interface TokenGenerator {
    /** Jeton aléatoire de 32 octets, transmis une seule fois au client. */
    generate(): string
    /** Empreinte stockée en base (SHA-256, hexadécimal) ; déterministe pour retrouver la session. */
    hash(token: string): string
}
