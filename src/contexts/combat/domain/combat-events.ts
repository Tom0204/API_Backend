import type { DomainEvent } from '../../../shared/domain/domain-event'
import type { Combat, TurnResult } from './combat'

export interface CombatStarted extends DomainEvent {
    readonly type: 'CombatStarted'
    readonly combatId: string
    readonly characterId: string
    readonly monsterId: string
}

/** Une attaque (L5 D4) : attaquant, dégâts, PV restants des deux participants après le coup. */
export interface CombatTurnPlayed extends DomainEvent {
    readonly type: 'CombatTurnPlayed'
    readonly combatId: string
    readonly characterId: string
    readonly attacker: 'CHARACTER' | 'MONSTER'
    readonly damage: number
    readonly characterHp: number
    readonly monsterHp: number
}

/** Fin de combat (rules.md §7) : la victoire déclenche les récompenses, la défaite aucune. */
export interface CombatWon extends DomainEvent {
    readonly type: 'CombatWon'
    readonly combatId: string
    readonly characterId: string
    readonly monsterId: string
}

export interface CombatLost extends DomainEvent {
    readonly type: 'CombatLost'
    readonly combatId: string
    readonly characterId: string
    readonly monsterId: string
}

export type CombatEvent = CombatStarted | CombatTurnPlayed | CombatWon | CombatLost

/**
 * Événements d'un combat qui vient d'être inséré (L5 D2 : l'identifiant est attribué par la base) :
 * `CombatStarted`, puis l'attaque d'ouverture du monstre s'il a l'initiative.
 */
export function combatStartedEvents(combat: Combat, openingTurn: TurnResult | null, now: Date): CombatEvent[] {
    const { id, characterId, monsterTemplateId, character, monster } = combat.snapshot
    const started: CombatStarted = { type: 'CombatStarted', occurredAt: now, combatId: id, characterId, monsterId: monsterTemplateId }
    if (openingTurn?.monsterDamage == null) return [started]
    const opening: CombatTurnPlayed = {
        type: 'CombatTurnPlayed',
        occurredAt: now,
        combatId: id,
        characterId,
        attacker: 'MONSTER',
        damage: openingTurn.monsterDamage,
        characterHp: character.hp,
        monsterHp: monster.hp
    }
    return [started, opening]
}
