import type { HealthReport } from './check-health'

/** Liste blanche des champs exposés. */
export function presentHealth(report: HealthReport) {
    return { status: report.status }
}
