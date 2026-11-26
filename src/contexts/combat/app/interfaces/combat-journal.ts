/** Un coup déjà joué, tel que le combat en a besoin pour son historique (PROD-01, L8 D2). */
export interface PlayedTurn {
    attacker: 'CHARACTER' | 'MONSTER'
    damage: number
    /** PV restants des deux participants après le coup. */
    characterHp: number
    monsterHp: number
}

/** Besoin du combat envers le journal (L5 D3, L8 D1) : les coups d'un combat, dans l'ordre où ils ont été joués. */
export interface CombatJournal {
    turnsOf(combatId: string): Promise<PlayedTurn[]>
}
