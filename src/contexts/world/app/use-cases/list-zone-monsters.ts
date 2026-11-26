import type { UnitOfWork } from '../../../../shared/app/unit-of-work'
import { worldErrors } from '../../domain/world-errors'
import type { WorldRepository } from '../interfaces/world-repository'

/** Monstre d'une zone : statistiques et XP, sans le butin (L3 D1). */
export interface MonsterOutput {
    id: string
    code: string
    name: string
    level: number
    stats: { hp: number; attack: number; defense: number; speed: number }
    xpReward: number
}

type Transaction = { world: WorldRepository }

/** Lecture simple des données de référence : aucun agrégat. */
export function createListZoneMonsters({ unitOfWork }: { unitOfWork: UnitOfWork<Transaction> }) {
    return {
        execute: ({ zoneId }: { zoneId: string }): Promise<MonsterOutput[]> =>
            unitOfWork.run(async ({ world }) => {
                if (!(await world.findZoneById(zoneId))) throw worldErrors.zoneNotFound()
                return (await world.findMonstersByZone(zoneId)).map((monster) => {
                    const { id, code, name, level, hp, attack, defense, speed, xpReward } = monster.snapshot
                    return { id, code, name, level, stats: { hp, attack, defense, speed }, xpReward }
                })
            })
    }
}

export type ListZoneMonsters = ReturnType<typeof createListZoneMonsters>
