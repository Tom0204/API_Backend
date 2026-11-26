import { combatErrors } from './combat-errors'
import type { CombatEvent } from './combat-events'
import { Combatant, type CombatantStats } from './combatant'
import { computeDamage } from './damage'

export type CombatStatus = 'IN_PROGRESS' | 'VICTORY' | 'DEFEAT'

/** Dégâts infligés pendant une requête ; `null` pour un participant qui n'a pas joué. */
export interface TurnResult {
    characterDamage: number | null
    monsterDamage: number | null
}

interface CombatState {
    characterId: string
    monsterTemplateId: string
    monsterName: string
    status: CombatStatus
    character: Combatant
    monster: Combatant
    finishedAt: Date | null
}

export interface CombatProps extends CombatState {
    id: string
    createdAt: Date
}

/** Combat à insérer : l'identifiant et la date de création sont attribués par la base. */
export type NewCombat = CombatState

/**
 * Agrégat pur (rules.md §6 et §7) : 1 personnage contre 1 instance de monstre, tour par tour, déterministe.
 * Le joueur ne fait que `ATTACK` ; le monstre riposte dans la même requête. `VICTORY` et `DEFEAT` sont terminaux.
 */
export class Combat {
    private events: CombatEvent[] = []

    private constructor(private props: CombatProps) {}

    /**
     * Fige les statistiques des deux participants, PV au maximum. Initiative : le plus rapide commence,
     * égalité → le personnage. Si le monstre commence, son premier tour est joué immédiatement.
     */
    static start(input: {
        characterId: string
        monsterTemplateId: string
        monsterName: string
        character: CombatantStats
        monster: CombatantStats
        now: Date
    }): { combat: NewCombat; openingTurn: TurnResult | null } {
        const state: CombatState = {
            characterId: input.characterId,
            monsterTemplateId: input.monsterTemplateId,
            monsterName: input.monsterName,
            status: 'IN_PROGRESS',
            character: Combatant.fresh(input.character),
            monster: Combatant.fresh(input.monster),
            finishedAt: null
        }
        if (input.monster.speed <= input.character.speed) {
            return { combat: state, openingTurn: null }
        }
        const { state: afterMonster, damage } = monsterAttacks(state, input.now)
        return { combat: afterMonster, openingTurn: { characterDamage: null, monsterDamage: damage } }
    }

    static restore(props: CombatProps): Combat {
        return new Combat(props)
    }

    get id(): string {
        return this.props.id
    }

    get isFinished(): boolean {
        return this.props.status !== 'IN_PROGRESS'
    }

    /**
     * Action `ATTACK` du joueur, puis riposte du monstre s'il est encore debout.
     * Enregistre un `CombatTurnPlayed` par attaque (L5 D4), puis `CombatWon` ou `CombatLost` à la fin.
     */
    attack(now: Date): TurnResult {
        if (this.isFinished) throw combatErrors.finished()

        const characterDamage = computeDamage(this.props.character.stats.attack, this.props.monster.stats.defense)
        const monster = this.props.monster.takeDamage(characterDamage)
        this.recordTurn('CHARACTER', characterDamage, this.props.character.hp, monster.hp, now)
        if (monster.isDefeated) {
            this.props = { ...this.props, monster, status: 'VICTORY', finishedAt: now }
            this.recordEnd('CombatWon', now)
            return { characterDamage, monsterDamage: null }
        }

        const { state, damage } = monsterAttacks({ ...this.props, monster }, now)
        this.props = { ...this.props, ...state }
        this.recordTurn('MONSTER', damage, state.character.hp, monster.hp, now)
        if (state.status === 'DEFEAT') this.recordEnd('CombatLost', now)
        return { characterDamage, monsterDamage: damage }
    }

    /** Événements enregistrés depuis la dernière lecture ; la liste est vidée (publication unique). */
    pullEvents(): CombatEvent[] {
        const events = this.events
        this.events = []
        return events
    }

    private recordTurn(attacker: 'CHARACTER' | 'MONSTER', damage: number, characterHp: number, monsterHp: number, now: Date) {
        const { id, characterId } = this.props
        this.events.push({ type: 'CombatTurnPlayed', occurredAt: now, combatId: id, characterId, attacker, damage, characterHp, monsterHp })
    }

    private recordEnd(type: 'CombatWon' | 'CombatLost', now: Date) {
        const { id, characterId, monsterTemplateId } = this.props
        this.events.push({ type, occurredAt: now, combatId: id, characterId, monsterId: monsterTemplateId })
    }

    get snapshot(): Readonly<CombatProps> {
        return this.props
    }
}

/** Attaque de base du monstre, résolue par le serveur. */
function monsterAttacks(state: CombatState, now: Date): { state: CombatState; damage: number } {
    const damage = computeDamage(state.monster.stats.attack, state.character.stats.defense)
    const character = state.character.takeDamage(damage)
    return character.isDefeated
        ? { state: { ...state, character, status: 'DEFEAT', finishedAt: now }, damage }
        : { state: { ...state, character }, damage }
}
