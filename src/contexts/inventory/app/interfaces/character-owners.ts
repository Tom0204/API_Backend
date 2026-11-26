/** Ce que l'inventaire attend des personnages ; fourni par le contexte characters. */
export interface CharacterOwners {
    /** Faux si le personnage n'existe pas ou appartient à un autre compte (même traitement). */
    isOwnedBy(characterId: string, accountId: string): Promise<boolean>
}
