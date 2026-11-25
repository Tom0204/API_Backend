import { DomainError } from '../shared/domain-error'

export const worldErrors = {
    zoneNotFound: () => new DomainError('ZONE_NOT_FOUND', 'NOT_FOUND', 'Zone not found')
}
