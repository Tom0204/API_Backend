import type { Character, NewCharacter } from '../../domain/character'

export interface CharacterRepository {
    findById(id: string): Promise<Character | undefined>
    /** Dans une transaction : verrouille le personnage jusqu'à la fin de la transaction. */
    findByIdForUpdate(id: string): Promise<Character | undefined>
    /** Personnages d'un compte, du plus ancien au plus récent. */
    findByAccount(accountId: string): Promise<Character[]>
    /** Dans une transaction : verrouille le compte, puis compte ses personnages. */
    countByAccountForUpdate(accountId: string): Promise<number>
    isNameTaken(normalizedName: string): Promise<boolean>
    /** Lève `CHARACTER_NAME_TAKEN` si le nom existe déjà, y compris lors de créations simultanées. */
    insert(character: NewCharacter): Promise<Character>
    /** Enregistre niveau et XP ; appelé après `findByIdForUpdate` dans la même transaction. */
    save(character: Character): Promise<void>
}
