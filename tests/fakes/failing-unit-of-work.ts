import { type AppTransaction, withContextServices } from '../../src/platform/transaction'
import type { EventHandler } from '../../src/shared/app/event-publisher'
import type { UnitOfWork } from '../../src/shared/app/unit-of-work'

/**
 * Panne injectée (REWARD-01) : même transaction réelle, mais l'écriture de l'inventaire échoue après
 * l'enregistrement du combat et de l'XP. Services et publieur d'événements sont reconstruits sur le
 * repository défaillant : c'est bien le vrai handler de butin (`CombatWon`) qui échoue. Tout doit être annulé.
 */
export function withFailingInventorySave(
    unitOfWork: UnitOfWork<AppTransaction>,
    handlers: readonly EventHandler<AppTransaction>[]
): UnitOfWork<AppTransaction> {
    return {
        run: (work) =>
            unitOfWork.run(({ accounts, sessions, characters, classes, world, combats, inventories, journal }) =>
                work(
                    withContextServices({
                        accounts,
                        sessions,
                        characters,
                        classes,
                        world,
                        combats,
                        journal,
                        inventories: {
                            ...inventories,
                            save: async () => {
                                throw new Error('Panne injectée pendant l’écriture de l’inventaire')
                            }
                        }
                    }, handlers)
                )
            )
    }
}
