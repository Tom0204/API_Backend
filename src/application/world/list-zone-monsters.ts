import type { MonsterTemplate } from '../../domain/world/monster-template'
import { worldErrors } from '../../domain/world/world-errors'
import type { UnitOfWork } from '../ports/unit-of-work'

/** Lecture simple des données de référence : aucun agrégat. */
export function createListZoneMonsters({ unitOfWork }: { unitOfWork: UnitOfWork }) {
    return {
        execute: ({ zoneId }: { zoneId: string }): Promise<MonsterTemplate[]> =>
            unitOfWork.run(async ({ world }) => {
                if (!(await world.findZoneById(zoneId))) throw worldErrors.zoneNotFound()
                return world.findMonstersByZone(zoneId)
            })
    }
}

export type ListZoneMonsters = ReturnType<typeof createListZoneMonsters>
