/** Ce que characters attend des monstres ; fourni par le contexte world. */
export interface MonsterExperience {
    /** XP fixe attribuée par la victoire sur ce monstre (rules.md §7) ; `undefined` si le monstre n'existe pas. */
    experienceFor(monsterId: string): Promise<number | undefined>
}
