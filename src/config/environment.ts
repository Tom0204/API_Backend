import { z } from 'zod'

const environmentSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Liste séparée par des virgules ; vide → aucune origine externe autorisée. */
    CORS_ORIGINS: z
        .string()
        .default('')
        .transform((value) =>
            value
                .split(',')
                .map((origin) => origin.trim())
                .filter((origin) => origin.length > 0)
        ),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ })
})

export type Environment = z.infer<typeof environmentSchema>

/**
 * Charge `.env` s'il existe (`process.loadEnvFile`, sans dotenv), puis valide les variables.
 * Une variable invalide arrête le démarrage ; le message ne cite que les noms, jamais les valeurs.
 */
export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
    try {
        process.loadEnvFile()
    } catch (error) {
        if (!isFileNotFound(error)) throw error
    }

    const result = environmentSchema.safeParse(source)
    if (!result.success) {
        const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
        throw new Error(`Invalid environment variables: ${names.join(', ')}`)
    }
    return result.data
}

function isFileNotFound(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
