# Architecture et exemple de référence

Règles non négociables : `AGENTS.md` §4. Ce document montre **la forme à imiter** pour tout nouveau code.
L'exemple suit « créer un personnage » (CHAR-02) à travers les couches, puis la fin de combat pour la
collaboration entre contextes. Organisation : **Clean Architecture par contexte** (DDD), avec un noyau commun.

## 1. Arborescence

```text
src/
├── shared/                          # noyau commun : ne dépend d'aucun contexte
│   ├── domain/                      # domain-error.ts, game-rules.ts (paramètres de rules.md)
│   └── app/                         # unit-of-work.ts (UnitOfWork<R>), event-publisher.ts, clock.ts, random-source.ts, auth-context.ts
├── contexts/
│   ├── identity/                    # comptes, sessions, authentification
│   ├── characters/                  # classes, personnages, statistiques, progression
│   ├── world/                       # zones, modèles de monstres et leur butin
│   ├── combat/                      # combat tour par tour, récompenses de victoire
│   ├── inventory/                   # inventaires, piles d'objets
│   └── journal/                     # journal des événements de jeu
│       ├── domain/                  # agrégats, objets-valeurs, règles, erreurs métier
│       ├── app/
│       │   ├── use-cases/           # un cas d'usage par fichier : entrée, sortie, execute
│       │   ├── interfaces/          # repositories, outils, besoins envers un autre contexte
│       │   ├── services/            # ce que le contexte offre aux autres
│       │   ├── handlers/            # réactions aux événements de domaine
│       │   └── utils/               # fonctions partagées par plusieurs cas d'usage
│       ├── api/                     # routes, contrôleurs, schémas Zod, présentateurs
│       └── infra/                   # repositories Prisma, adaptateurs (argon2, jetons)
├── platform/                        # technique commune et assemblage
│   ├── http/                        # app.ts, http-response.ts, request-auth.ts, middlewares/
│   ├── health/                      # GET /health (technique, hors contexte)
│   ├── prisma/                      # client.ts, prisma-unit-of-work.ts, prisma-errors.ts, seed-reference-data.ts
│   ├── system/  logging/            # system-clock.ts, crypto-random-source.ts, logger.ts
│   ├── events/                      # event-publisher.ts (file FIFO), event-handlers.ts (registre ordonné)
│   └── transaction.ts               # seul endroit qui relie les contextes
├── config/environment.ts
└── main.ts                          # composition
tests/
├── unit/domain/  unit/application/  unit/infrastructure/  integration/  database/
├── contracts/                       # même contrat pour les repositories en mémoire et Prisma
├── fakes/                           # UnitOfWork en mémoire, ports factices, panne injectée
└── architecture.test.ts
```

Nommage : fichiers en kebab-case ; une fonction ou une classe exportée principale par fichier ;
un cas d'usage = un fichier = une fonction `createXxx(deps)` qui renvoie `execute(input)`.
Un dossier n'existe que s'il contient quelque chose.

## 2. Domaine (`contexts/X/domain/`, `shared/domain/`)

### Erreur métier

```ts
// src/shared/domain/domain-error.ts
export type DomainErrorKind = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RULE_VIOLATION'

export class DomainError extends Error {
    constructor(readonly code: string, readonly kind: DomainErrorKind, message: string) {
        super(message)
        this.name = 'DomainError'
    }
}
```

### Objet-valeur

```ts
// src/contexts/characters/domain/character-name.ts
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
// src/contexts/characters/domain/character.ts
export class Character {
    private constructor(private props: CharacterProps) {}

    /** Création : niveau 1, XP 0, zone de départ (rules.md §4). L'identifiant est attribué par la base. */
    static create(input: { accountId: string; classId: string; startingZoneId: string; name: CharacterName }): NewCharacter

    static restore(props: CharacterProps): Character

    isOwnedBy(accountId: string): boolean

    /** Seule façon de modifier l'XP : aucune route ne l'expose (rules.md §5). */
    gainExperience(amount: number): number

    get snapshot(): Readonly<CharacterProps>
}
```

## 3. Application (`contexts/X/app/`)

### Ports

Les interfaces dont les cas d'usage ont besoin vivent dans `app/interfaces/` du contexte (repositories, outils
techniques) ; les ports communs vivent dans `shared/app/`.

```ts
// src/shared/app/unit-of-work.ts
/** `R` : ce que la transaction met à disposition ; chaque cas d'usage n'y déclare que ce qu'il utilise. */
export interface UnitOfWork<R> {
    run<T>(work: (transaction: R) => Promise<T>): Promise<T>
}
```

### Cas d'usage

```ts
// src/contexts/characters/app/use-cases/create-character.ts
export interface CreateCharacterInput {
    accountId: string // toujours tiré du jeton, jamais du corps
    name: string
    classId: string
}

type Transaction = { characters: CharacterRepository; classes: CharacterClassRepository }

export function createCreateCharacter({ unitOfWork, startingZoneId }: { unitOfWork: UnitOfWork<Transaction>; startingZoneId: string }) {
    return {
        execute: (input: CreateCharacterInput): Promise<CharacterOutput> =>
            unitOfWork.run(async ({ characters, classes }) => {
                if (!(await classes.findById(input.classId))) throw characterErrors.classNotFound()
                // Verrou sur le compte : deux créations simultanées s'exécutent l'une après l'autre.
                if ((await characters.countByAccountForUpdate(input.accountId)) >= MAX_CHARACTERS_PER_ACCOUNT) {
                    throw characterErrors.limitReached()
                }
                const name = CharacterName.create(input.name)
                if (await characters.isNameTaken(name.normalized)) throw characterErrors.nameTaken()
                const character = await characters.insert(
                    Character.create({ accountId: input.accountId, classId: input.classId, startingZoneId, name })
                )
                return toCharacterOutput(character) // sortie simple : jamais l'entité
            })
    }
}
```

Points à retenir : le cas d'usage **orchestre** (droits, transaction, ordre des contrôles) ; les **règles** sont dans
le domaine ; il ne connaît ni HTTP ni Prisma ; il renvoie une **sortie simple** définie dans `app/` (ici
`app/utils/character-output.ts`, partagée par plusieurs cas d'usage).

## 4. Collaboration entre contextes

Un contexte n'importe jamais un autre contexte. Exemple : le combat a besoin d'un personnage (statistiques, verrou, XP).

**1. Le consommateur déclare son besoin, dans ses termes :**

```ts
// src/contexts/combat/app/interfaces/combat-fighters.ts
export interface Fighter { id: string; zoneId: string; stats: CombatantStats }

export interface CombatFighters {
    lockOwned(characterId: string, accountId: string): Promise<Fighter | undefined>
    isOwnedBy(characterId: string, accountId: string): Promise<boolean>
}
```

**2. Le propriétaire de la donnée le satisfait, avec ses propres règles, sans importer le consommateur :**

```ts
// src/contexts/characters/app/services/combat-fighters.ts
export function createCombatFighters({ characters, classes }: { characters: CharacterRepository; classes: CharacterClassRepository }) {
    return {
        async lockOwned(characterId: string, accountId: string) {
            const character = await characters.findByIdForUpdate(characterId)
            if (!character?.isOwnedBy(accountId)) return undefined
            const stats = Stats.forLevel(/* classe du personnage */, character.snapshot.progression.level)
            return { id: character.id, zoneId: character.snapshot.zoneId, stats: { maxHp: stats.hp, /* … */ } }
        },
        // isOwnedBy
    }
}
```

**3. Seul `platform/transaction.ts` les relie, sur une même transaction ; TypeScript y vérifie la compatibilité :**

```ts
// src/platform/transaction.ts
export function withContextServices(repositories: AppRepositories, handlers: readonly EventHandler<AppTransaction>[]): AppTransaction {
    const fighters: CombatFighters = createCombatFighters(repositories)
    const monsters: CombatMonsters = createCombatMonsters(repositories)
    // … characterOwners, monsterExperience, lootTables
    const transaction: AppTransaction = { ...repositories, fighters, monsters, /* … */ events: createEventPublisher(handlers, () => transaction) }
    return transaction
}
```

Contrats actuels : `combat` attend `CombatFighters` (characters), `CombatMonsters` (world) et `CombatJournal` (journal) ; `characters` attend
`MonsterExperience` (world) ; `inventory` attend `CharacterOwners` (characters) et `LootTables` (world).

### Événements de domaine

Quand un contexte n'a pas à **demander** une donnée mais à **signaler** un fait, il publie un événement.
Exemple : la victoire (EVT-02).

**1. L'agrégat enregistre l'événement ; le cas d'usage le publie dans sa transaction :**

```ts
// src/contexts/combat/domain/combat.ts : à la transition VICTORY
this.events.push({ type: 'CombatWon', occurredAt: now, combatId: id, characterId, monsterId: monsterTemplateId })

// src/contexts/combat/app/use-cases/play-combat-action.ts
const lastTurn = combat.attack(clock.now())
await combats.save(combat)
const published = await events.publish(combat.pullEvents()) // handlers exécutés ici, dans la même transaction
const rewards = combat.snapshot.status === 'VICTORY' ? rewardsFromEvents(published, combat.id) : null
```

**2. Chaque contexte récepteur déclare la forme attendue et réagit, sans importer le combat :**

```ts
// src/contexts/characters/app/interfaces/combat-won.ts : contrat par le `type`, avec une garde
export interface CombatWonEvent extends DomainEvent { type: 'CombatWon'; combatId: string; characterId: string; monsterId: string }
export function isCombatWon(event: DomainEvent): event is CombatWonEvent

// src/contexts/characters/app/handlers/grant-combat-experience.ts : XP, puis événements de suite
handle: async (event, { characters, monsterExperience }) => {
    // … gainExperience puis save (verrou sur le personnage après celui du combat)
    return [granted, ...character.pullEvents()] // ExperienceGranted, CharacterLeveledUp
}
```

**3. Seul `platform/events/event-handlers.ts` enregistre les handlers, dans un ordre fixe :**
characters (XP) → inventory (butin) → journal (enregistre tout). Le publieur traite une file FIFO : les événements
produits par un handler (`ExperienceGranted`, `LootAwarded`) passent après ceux déjà en file ; `publish` renvoie toute
la cascade, d'où le combat compose la réponse (`rewards`). Un handler en échec annule toute la transaction ; un même
événement ne peut être publié qu'une fois. La fin de combat modifie ainsi trois agrégats dans **un seul** `UnitOfWork`.

## 5. Infrastructure (`contexts/X/infra/`, `platform/prisma/`)

```ts
// src/platform/prisma/prisma-unit-of-work.ts
export function createPrismaUnitOfWork(prisma: PrismaClient, handlers: readonly EventHandler<AppTransaction>[]): UnitOfWork<AppTransaction> {
    return {
        run: (work) =>
            prisma.$transaction((tx) =>
                work(withContextServices({
                    characters: createPrismaCharacterRepository(tx),
                    // … un repository par agrégat, tous sur la même transaction
                }, handlers))
            )
    }
}

// Extrait de contexts/characters/infra/prisma-character-repository.ts : verrou réel, puis reconstruction.
async countByAccountForUpdate(accountId) {
    await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`
    return tx.character.count({ where: { accountId } })
}
```

La version en mémoire de `UnitOfWork` (`tests/fakes/`) exécute `work` sur une copie des données, avec les mêmes
services entre contextes, et ne la conserve que si `work` réussit : mêmes garanties d'annulation sans base.

## 6. Interface HTTP (`contexts/X/api/`, `platform/http/`)

```ts
// src/contexts/characters/api/character.schemas.ts
export const createCharacterBody = z.strictObject({
    name: z.string().regex(CHARACTER_NAME_PATTERN, 'Must be 3 to 16 letters (A-Z, a-z)'),
    classId: z.uuid('Must be a valid UUID')
})

// character.controller.ts : lire, appeler, présenter. Aucune règle métier.
create: asyncHandler(async (req, res) => {
    const character = await createCharacter.execute({ accountId: getAuth(req).accountId, ...req.body })
    res.status(201).json(success('Character created successfully', presentCharacter(character)))
})

// character.presenter.ts : ne connaît que la sortie du cas d'usage (liste blanche, dates en ISO).
export function presentCharacter({ id, name, classId, zoneId, level, experience, createdAt }: CharacterOutput)

// platform/http/middlewares/error-handler.ts : seule traduction des erreurs du domaine.
const STATUS_BY_KIND = { UNAUTHENTICATED: 401, NOT_FOUND: 404, CONFLICT: 409, RULE_VIOLATION: 422 } as const
```

`getAuth(req)` vient de `platform/http/request-auth.ts` ; le middleware `requireAuth` (contexte identity) y range
l'identité de la requête. Ainsi aucune route n'importe le contexte identity.

## 7. Composition

```ts
// src/main.ts : seul fichier qui connaît toutes les implémentations.
const prisma = createPrismaClient(env.DATABASE_URL)
const random = createCryptoRandomSource()
const unitOfWork = createPrismaUnitOfWork(prisma, createEventHandlers({ random })) // accepté par chaque cas d'usage
const app = createApp({
    createCharacter: createCreateCharacter({ unitOfWork, startingZoneId: await findStartingZoneId(prisma) }),
    // … un cas d'usage par route
})
```

Les tests HTTP appellent `createApp` avec les mêmes cas d'usage construits sur `tests/fakes/`.

## 8. Règle de dépendance (test)

`tests/architecture.test.ts` classe chaque fichier de `src/` dans une zone (`shared`, `contexts/X/couche`,
`platform`, racine) et vérifie chaque import :

| Depuis | Peut importer |
|---|---|
| `shared/domain` | `shared/domain` |
| `shared/app` | `shared/` |
| `X/domain` | `X/domain`, `shared/domain` |
| `X/app` | `X/domain`, `X/app`, `shared/` |
| `X/api` | `X/app`, `X/api`, `shared/`, `platform/http` ; de `X/domain` : erreurs, et constantes dans `*.schemas.ts` |
| `X/infra` | `X/domain`, `X/app`, `X/infra`, `shared/`, `platform/prisma`, client généré |
| `platform/`, `main.ts`, `config/` | tout |

Jamais `contexts/X` → `contexts/Y`. Paquets : aucun dans `shared`, `domain` et `app` ; `express` et `zod` seuls dans
`api` ; libres dans `infra` et `platform`. Des cas volontairement fautifs vérifient le test lui-même.

## 9. Où placer une nouvelle règle ?

| Question | Emplacement |
|---|---|
| Valeur chiffrée de `rules.md` ? | `shared/domain/game-rules.ts` |
| Calcul ou invariant sur un seul agrégat ? | Méthode de l'agrégat ou de l'objet-valeur du contexte |
| Calcul entre deux participants sans état (dégâts) ? | Fonction pure du domaine (`contexts/combat/domain/damage.ts`) |
| Droits, ordre des contrôles, transaction, plusieurs repositories ? | Cas d'usage |
| Besoin d'une donnée d'un autre contexte ? | Contrat dans `X/app/interfaces`, service dans le contexte propriétaire, lien dans `platform/transaction.ts` |
| Réagir à un fait d'un autre contexte ? | Événement du domaine émetteur, forme attendue dans `X/app/interfaces`, handler dans `X/app/handlers`, enregistré dans `platform/events/event-handlers.ts` |
| Format d'entrée HTTP ? | Schéma Zod (`X/api/*.schemas.ts`) |
| Forme de sortie ? | Sortie du cas d'usage (`X/app`) puis présentateur (`X/api`) |
