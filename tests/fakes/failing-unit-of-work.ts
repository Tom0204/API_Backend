import type { UnitOfWork } from '../../src/application/ports/unit-of-work'

/**
 * Panne injectée (REWARD-01) : même transaction réelle, mais l'écriture de l'inventaire échoue après
 * l'enregistrement du combat et du personnage. Tout doit être annulé.
 */
export function withFailingInventorySave(unitOfWork: UnitOfWork): UnitOfWork {
    return {
        run: (work) =>
            unitOfWork.run((repositories) =>
                work({
                    ...repositories,
                    inventories: {
                        ...repositories.inventories,
                        save: async () => {
                            throw new Error('Panne injectée pendant l’écriture de l’inventaire')
                        }
                    }
                })
            )
    }
}
