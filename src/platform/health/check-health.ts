export interface HealthReport {
    status: 'UP'
}

/** Vivacité du service (D3) : répond sans accéder à la base. */
export function createCheckHealth() {
    return {
        execute: async (): Promise<HealthReport> => ({ status: 'UP' })
    }
}

export type CheckHealth = ReturnType<typeof createCheckHealth>
