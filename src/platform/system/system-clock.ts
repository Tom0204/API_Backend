import type { Clock } from '../../shared/app/clock'

export function createSystemClock(): Clock {
    return { now: () => new Date() }
}
