import type { HealthReport } from '../../../application/health/check-health'

/** Liste blanche des champs exposés. */
export function presentHealth(report: HealthReport) {
    return { status: report.status }
}
