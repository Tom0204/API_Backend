import type { MonsterTemplate } from '../../domain/monster-template'
import type { Zone } from '../../domain/zone'

/** Lecture des données de référence du monde. */
export interface WorldRepository {
    findZoneById(id: string): Promise<Zone | undefined>
    /** Monstres de la zone, triés par niveau. */
    findMonstersByZone(zoneId: string): Promise<MonsterTemplate[]>
    findMonsterById(id: string): Promise<MonsterTemplate | undefined>
}
