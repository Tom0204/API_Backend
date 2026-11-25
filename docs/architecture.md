# Architecture et exemple de référence

Règles non négociables : `AGENTS.md` §4. Ce document montre **la forme à imiter** pour tout nouveau code.
L'exemple suit le cas « créer un personnage » (CHAR-02) à travers les quatre couches. Le premier lot (ARCH-01)
produit ce squelette réel ; il est validé avant tout autre ticket.

## 1. Arborescence

```text
src/
├── domain/                       # aucune dépendance technique
│   ├── shared/                   # DomainError, game-rules.ts (paramètres de rules.md)
│   ├── identity/                 # Account, Email, AccountRepository
│   ├── characters/               # Character, CharacterName, Progression, Stats, CharacterClass, CharacterRepository
│   ├── world/                    # Zone, MonsterTemplate, WorldRepository
│   ├── combat/                   # Combat, Combatant, CombatRepository
│   └── inventory/                # Inventory, ItemStack, InventoryRepository
├── application/
│   ├── ports/                    # UnitOfWork, PasswordHasher, Clock, RandomSource, TokenGenerator
│   ├── identity/                 # register-account.ts, login.ts, authenticate.ts
│   ├── characters/               # create-character.ts, list-my-characters.ts, get-character-stats.ts
│   ├── world/  combat/  inventory/
├── infrastructure/
│   ├── prisma/                   # client.ts, prisma-unit-of-work.ts, prisma-<agrégat>-repository.ts
│   └── security/  system/        # argon2-password-hasher.ts, system-clock.ts, crypto-random-source.ts
├── interfaces/http/
│   ├── app.ts                    # createApp(useCases) : middlewares, routes, gestion d'erreurs
│   ├── middlewares/              # require-auth.ts, validate.ts, error-handler.ts, request-logger.ts
│   └── characters/               # character.routes.ts, character.controller.ts, character.schemas.ts, character.presenter.ts
├── config/environment.ts
└── main.ts                       # composition
tests/
├── unit/domain/  unit/application/  integration/  database/
├── fakes/                        # repositories et ports en mémoire, UnitOfWork en mémoire
└── architecture.test.ts
```

Nommage : fichiers en kebab-case ; une classe ou une fonction exportée principale par fichier ;
un cas d'usage = un fichier = une fonction `createXxx(deps)` qui renvoie `execute(...)`.

## 2. Domaine

### Erreur métier

```ts
// src/domain/shared/domain-error.ts
export type DomainErrorKind = 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT' | 'RULE_VIOLATION'

export class DomainError extends Error {
    constructor(readonly code: string, readonly kind: DomainErrorKind, message: string) {
        super(message)
        this.name = 'DomainError'
    }
}
```

### Objet-valeur

```ts
// src/domain/characters/character-name.ts
import { CHARACTER_NAME_PATTERN } from '../shared/game-rules'

export class CharacterName {
    private constructor(readonly value: string) {}

    /** Le format est déjà vérifié par Zod en HTTP ; ici, il protège le domaine quel que soit l'appelant. */
    static create(raw: string): CharacterName {
        if (!CHARACTER_NAME_PATTERN.test(raw)) {
            throw new Error(`Nom de personnage invalide : ${raw}`) // invariant violé → 500
        }
        return new CharacterName(raw)
    }

    get normalized(): string {
        return this.value.toLowerCase()
    }
}
```

### Agrégat

```ts
// src/domain/characters/character.ts
export interface CharacterProps {
    id: string
    accountId: string
    classId: string
    zoneId: string
    name: CharacterName
    progression: Progression // objet-valeur : niveau + XP dans le niveau (rules.md §5)
}

export class Character {
    private constructor(private props: CharacterProps) {}

    /** Création : niveau 1, XP 0, zone de départ (rules.md §4). L'identifiant est attribué par la base. */
    static create(input: { accountId: string; classId: string; startingZoneId: string; name: CharacterName }) {
        return { ...input, zoneId: input.startingZoneId, progression: Progression.initial() }
    }

    static restore(props: CharacterProps): Character {
        return new Character(props)
    }

    isOwnedBy(accountId: string): boolean {
        return this.props.accountId === accountId
    }

    /** Seule façon de modifier l'XP : aucune route ne l'expose (rules.md §5). */
    gainExperience(amount: number): number {
        const { progression, levelsGained } = this.props.progression.gain(amount)
        this.props = { ...this.props, progression }
        return levelsGained
    }

    get snapshot(): Readonly<CharacterProps> {
        return this.props
    }
}
```

### Port du repository (défini par le domaine)

```ts
// src/domain/characters/character-repository.ts
export interface CharacterRepository {
    findById(id: string): Promise<Character | undefined>
    /** Dans une transaction : verrouille la ligne jusqu'à la fin de la transaction. */
    findByIdForUpdate(id: string): Promise<Character | undefined>
    /** Dans une transaction : verrouille le compte, puis compte ses personnages. */
    countByAccountForUpdate(accountId: string): Promise<number>
    isNameTaken(normalizedName: string): Promise<boolean>
    insert(character: ReturnType<typeof Character.create>): Promise<Character>
    save(character: Character): Promise<void>
}
```

## 3. Application

### Ports

```ts
// src/application/ports/unit-of-work.ts
export interface Repositories {
    characters: CharacterRepository
    classes: CharacterClassRepository
    combats: CombatRepository
    inventories: InventoryRepository
}

/** Exécute `work` dans une transaction : tout est validé, ou tout est annulé si une erreur est levée. */
export interface UnitOfWork {
    run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>
}
```

### Cas d'usage

```ts
// src/application/characters/create-character.ts
export interface CreateCharacterCommand {
    accountId: string // toujours tiré du jeton, jamais du corps
    name: string
    classId: string
}

export function createCreateCharacter({ unitOfWork, startingZoneId }: { unitOfWork: UnitOfWork; startingZoneId: string }) {
    return {
        execute: (command: CreateCharacterCommand) =>
            unitOfWork.run(async ({ characters, classes }) => {
                if (!(await classes.findById(command.classId))) {
                    throw new DomainError('CLASS_NOT_FOUND', 'RULE_VIOLATION', 'Class not found')
                }
                // Verrou sur le compte : deux créations simultanées s'exécutent l'une après l'autre.
                if ((await characters.countByAccountForUpdate(command.accountId)) >= MAX_CHARACTERS_PER_ACCOUNT) {
                    throw new DomainError('CHARACTER_LIMIT_REACHED', 'CONFLICT', 'Character limit reached')
                }
                const name = CharacterName.create(command.name)
                if (await characters.isNameTaken(name.normalized)) {
                    throw new DomainError('CHARACTER_NAME_TAKEN', 'CONFLICT', 'Character name already taken')
                }
                return characters.insert(
                    Character.create({ accountId: command.accountId, classId: command.classId, startingZoneId, name })
                )
            })
    }
}
```

Points à retenir : le cas d'usage **orchestre** (droits, transaction, ordre des contrôles) ; les **règles** sont dans
le domaine ; il ne connaît ni HTTP ni Prisma. Une violation d'unicité levée par la base en concurrence est traduite
en `DomainError` par le repository Prisma.

## 4. Infrastructure

```ts
// src/infrastructure/prisma/prisma-unit-of-work.ts
export function createPrismaUnitOfWork(prisma: PrismaClient): UnitOfWork {
    return {
        run: (work) =>
            prisma.$transaction((tx) =>
                work({
                    characters: createPrismaCharacterRepository(tx),
                    classes: createPrismaCharacterClassRepository(tx),
                    combats: createPrismaCombatRepository(tx),
                    inventories: createPrismaInventoryRepository(tx)
                })
            )
    }
}

// Extrait de prisma-character-repository.ts : verrou réel, puis reconstruction de l'agrégat.
async countByAccountForUpdate(accountId) {
    await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`
    return tx.character.count({ where: { accountId } })
}
```

La version en mémoire de `UnitOfWork` (`tests/fakes/`) exécute `work` sur une copie des données et ne la conserve
que si `work` réussit : mêmes garanties d'annulation pour les tests sans base.

## 5. Interface HTTP

```ts
// src/interfaces/http/characters/character.schemas.ts
export const createCharacterBody = z.strictObject({
    name: z.string().regex(CHARACTER_NAME_PATTERN, 'Must be 3 to 16 letters (A-Z, a-z)'),
    classId: z.uuid('Must be a valid UUID')
})

// character.controller.ts : lire, appeler, présenter. Aucune règle métier.
create: asyncHandler(async (req, res) => {
    const character = await createCharacter.execute({ accountId: getAuth(req).accountId, ...req.body })
    res.status(201).json(success('Character created successfully', presentCharacter(character)))
})

// middlewares/error-handler.ts : seule traduction des erreurs du domaine.
const STATUS_BY_KIND = { UNAUTHENTICATED: 401, NOT_FOUND: 404, CONFLICT: 409, RULE_VIOLATION: 422 } as const
```

## 6. Composition

```ts
// src/main.ts : seul fichier qui connaît toutes les implémentations.
const prisma = createPrismaClient(env.DATABASE_URL)
const unitOfWork = createPrismaUnitOfWork(prisma)
const app = createApp({
    createCharacter: createCreateCharacter({ unitOfWork, startingZoneId: await findStartingZoneId(prisma) }),
    // … un cas d'usage par route
})
```

Les tests HTTP appellent `createApp` avec les mêmes cas d'usage construits sur `tests/fakes/`.

## 7. Règle de dépendance (test)

```ts
// tests/architecture.test.ts
const FORBIDDEN = {
    'src/domain': [/from 'express'/, /generated\/prisma/, /from 'zod'/, /\/application\//, /\/infrastructure\//, /\/interfaces\//],
    'src/application': [/from 'express'/, /generated\/prisma/, /\/infrastructure\//, /\/interfaces\//]
}
// Pour chaque fichier .ts de chaque dossier : aucun import ne correspond à un motif interdit.
```

## 8. Où placer une nouvelle règle ?

| Question | Emplacement |
|---|---|
| Valeur chiffrée de `rules.md` ? | `domain/shared/game-rules.ts` |
| Calcul ou invariant sur un seul agrégat ? | Méthode de l'agrégat ou de l'objet-valeur |
| Calcul qui concerne deux agrégats sans état (dégâts entre deux combattants) ? | Fonction pure du domaine (`domain/combat/damage.ts`) |
| Droits, ordre des contrôles, transaction, appel de plusieurs repositories ? | Cas d'usage |
| Format d'entrée HTTP ? | Schéma Zod |
| Forme de sortie ? | Présentateur |
