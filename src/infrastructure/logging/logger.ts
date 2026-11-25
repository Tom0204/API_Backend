import { type DestinationStream, type Level, type Logger, pino } from 'pino'

/** URL de connexion PostgreSQL (avec identifiants) : ne doit jamais apparaître dans un log (AGENTS.md §5). */
const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"'\\]+/gi

export function redactDatabaseUrls(line: string): string {
    return line.replace(DATABASE_URL_PATTERN, 'postgresql://[REDACTED]')
}

/**
 * Logs JSON sur la sortie standard. Le contenu des logs HTTP est fixé par `request-logger.ts` ;
 * en plus, toute ligne écrite est filtrée : une erreur de pilote qui citerait l'URL de connexion est masquée.
 */
export function createLogger(level: Level | 'silent', destination?: DestinationStream): Logger {
    const options = { level, hooks: { streamWrite: redactDatabaseUrls } }
    return destination ? pino(options, destination) : pino(options)
}
