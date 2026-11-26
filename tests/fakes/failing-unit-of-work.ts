import { type AppTransaction, withContextServices } from '../../src/platform/transaction'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'

/**
 * Panne injectée (REWARD-01) : même transaction réelle, mais l'écriture de l'inventaire échoue après
 * l'enregistrement du combat et du personnage. Les services entre contextes sont reconstruits sur le
 * repository défaillant : c'est bien le vrai service de butin qui échoue. Tout doit être annulé.
 */
export function withFailingInventorySave(unitOfWork: UnitOfWork<AppTransaction>): UnitOfWork<AppTransaction> {
    return {
        run: (work) =>
            unitOfWork.run(({ accounts, sessions, characters, classes, world, combats, inventories }) =>
                work(
                    withContextServices({
                        accounts,
                        sessions,
                        characters,
                        classes,
                        world,
                        combats,
                        inventories: {
                            ...inventories,
                            save: async () => {
                                throw new Error('Panne injectée pendant l’écriture de l’inventaire')
                            }
                        }
                    })
                )
            )
    }
}
