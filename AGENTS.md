# AGENTS.md

Instructions communes aux agents IA. Ce fichier ne contient **que des règles stables** : aucun état d'avancement,
aucun hash de commit, aucun nombre de tests. L'état réel se lit dans `Backlog.md` et dans `git log`.

## 1. Projet

- API REST d'un MMORPG inspiré de World of Warcraft. **Backend uniquement**, jamais de Front-End.
- Projet étudiant de 3ᵉ année de Bachelor, réalisé en **8 jours**. Viser un parcours complet, propre et testé,
  pas un grand nombre de fonctionnalités : rien n'est développé hors de `Backlog.md`.
- L'agent agit comme un développeur backend expérimenté : il explique ses choix et leurs conséquences,
  sans simplifier à l'excès ni ajouter d'abstraction inutile.
- **Règle fondamentale : le serveur ne fait jamais confiance au client.** Statistiques, dégâts, XP, niveaux, butin
  et droits sont calculés et vérifiés côté serveur. Le client transmet une intention.

## 2. Documents : une source par sujet

| Sujet | Source unique |
|---|---|
| Tickets, ordre, critères, **statut** | `Backlog.md` |
| Règles de jeu chiffrées | `docs/rules.md` |
| Architecture et exemple de code de référence | `docs/architecture.md` |
| Contrat HTTP | `docs/conventions.md` |
| Décisions d'un lot | `docs/lots/LN.md` (modèle : `docs/lots/_modele.md`) |
| Installation, commandes | `README.md` |

- Une règle n'est écrite qu'à un seul endroit ; les autres documents y renvoient.
- En cas de contradiction, le code et `docs/` font foi : le signaler et proposer la correction.
- **Une règle de jeu absente de `docs/rules.md` n'est jamais inventée** : elle devient une décision D à valider.
- Avant d'écrire du code, relire l'exemple de `docs/architecture.md` et l'imiter.

### En cas de doute : demander, ne pas inventer

| Situation | Action |
|---|---|
| Règle de jeu, valeur chiffrée, code d'erreur ou forme de réponse absents des documents | **Demander** (décision D) |
| Critère d'acceptation ambigu, contradictoire ou impossible | **Demander** |
| Choix structurant : dépendance, schéma de base, changement de contrat, modification d'un document de référence | **Demander** |
| Détail d'implémentation couvert par `docs/architecture.md` (nommage, emplacement, forme) | Décider seul en imitant l'exemple |

- Pendant l'audit, toutes les questions sont posées d'un coup, avec une recommandation pour chacune.
- Pendant la réalisation, une question imprévue arrête le travail : poser la question, avec le contexte et une
  recommandation, puis attendre. Ne jamais choisir « provisoirement » une règle métier.
- Toute hypothèse faite malgré tout est signalée explicitement dans le bilan, jamais passée sous silence.

## 3. Stack (les versions de `package.json` font foi)

| Domaine | Choix |
|---|---|
| Langage | Node.js 22, TypeScript strict, ESM ; build CommonJS par tsup |
| HTTP | Express 4, Zod 4, Helmet, cors, express-rate-limit |
| Base | PostgreSQL 18 (Docker Compose), Prisma 7 + `@prisma/adapter-pg`, identifiants UUID v7 générés par PostgreSQL |
| Authentification | Jetons opaques (32 octets aléatoires, empreintes SHA-256 en base) : accès court en `Bearer`, rafraîchissement à usage unique avec rotation ; durées et seuil de verrouillage dans le domaine `identity` ; mots de passe en Argon2id |
| Logs | Pino, pino-http |
| Tests | Vitest, Supertest ; validation manuelle avec Postman |
| Configuration | `src/config/environment.ts`, `.env` chargé par `process.loadEnvFile()` (pas de dotenv) |

Aucune autre dépendance sans décision D validée.

## 4. Architecture : Clean Architecture et DDD

Détail et exemple complet : `docs/architecture.md`. Les règles ci-dessous sont **non négociables**.

**Organisation par contexte** (`identity`, `characters`, `world`, `combat`, `inventory`, `journal`) : `src/contexts/<contexte>/<couche>/`.
Un dossier n'existe que s'il contient quelque chose.

| Dossier | Contient | Peut importer |
|---|---|---|
| `src/shared/domain/` | `DomainError`, `game-rules.ts` (paramètres de `rules.md`) | `shared/domain/` |
| `src/shared/app/` | Ports communs : `UnitOfWork<R>`, `Clock`, `RandomSource`, `AuthContext`, `EventPublisher`, `EventHandler` | `shared/` |
| `contexts/X/domain/` | Agrégats, entités, objets-valeurs, règles de jeu, erreurs métier | `X/domain`, `shared/domain` |
| `contexts/X/app/use-cases/` | Un cas d'usage par fichier : type d'entrée, type de sortie, `execute` | `X/domain`, `X/app`, `shared` |
| `contexts/X/app/interfaces/` | Ce dont les cas d'usage ont besoin : repositories, outils techniques, **données d'un autre contexte** | idem |
| `contexts/X/app/services/` | Ce que X offre aux autres contextes, dans la forme de **leur** interface (typage structurel) | idem |
| `contexts/X/app/handlers/` | Réactions de X aux événements (un handler par fichier) ; renvoient les événements qu'elles produisent | idem |
| `contexts/X/app/utils/` | Fonctions partagées par plusieurs cas d'usage (conversion en sortie, contrôle de propriété) | idem |
| `contexts/X/api/` | Routes, contrôleurs, schémas Zod, présentateurs | `X/app`, `shared`, `platform/http` ; de `X/domain`, seulement les erreurs et, dans les `*.schemas.ts`, les constantes de validation |
| `contexts/X/infra/` | Implémentations Prisma, adaptateurs (Argon2, jetons) | `X/domain`, `X/app`, `shared`, `platform/prisma`, client généré |
| `src/platform/` | Express, middlewares communs, `UnitOfWork` Prisma, horloge, aléatoire, logs, `transaction.ts` | Tout |
| `src/main.ts` | Composition : construit l'infrastructure et l'injecte | Tout |

- **Règle de dépendance** vérifiée par `tests/architecture.test.ts` : `domain/` et `app/` n'importent aucun paquet
  (ni Express, ni Prisma, ni Zod, ni module `node:`) ; **un contexte n'importe jamais un autre contexte**.
- **Entre contextes :** le contexte consommateur déclare un contrat dans ses `app/interfaces` (ex. `CombatFighters`),
  dans ses propres termes ; le contexte propriétaire le satisfait par un service qui applique ses propres règles.
  Seul `platform/transaction.ts` relie services et contrats, et TypeScript y vérifie leur compatibilité.
- **Événements de domaine :** faits passés et immuables (`CombatWon`), déclarés dans le domaine du contexte émetteur ;
  l'agrégat les enregistre (`pullEvents()`), le cas d'usage les publie par le port `EventPublisher` de sa transaction.
  Un événement de création, dont l'identifiant vient de la base, est construit par le cas d'usage après l'insertion.
  Chaque contexte récepteur déclare dans ses `app/interfaces` la forme qu'il attend (garde de type sur le `type`).
  Handlers enregistrés dans `platform/events/event-handlers.ts` seulement, dans un ordre fixe ; exécution synchrone
  dans le `UnitOfWork` (file FIFO) : un handler en échec annule toute la transaction. Pas de bus asynchrone.
- **Cas d'usage :** `createXxx(deps)` renvoie `execute(input)`. Il déclare un type `Transaction` avec **uniquement** ce
  qu'il utilise (`UnitOfWork<Transaction>`) et renvoie une **sortie simple** : jamais une entité du domaine.
  Les présentateurs ne connaissent que ces sorties.
- **Agrégats :** modifiés uniquement par leur racine ; référencés entre eux **par identifiant**.
  Une transaction ne modifie qu'un agrégat, sauf la fin de combat (combat + personnage + inventaire), coordonnée par
  un seul cas d'usage dans un `UnitOfWork`, par l'événement `CombatWon` et ses handlers (characters, inventory).
- **Objets-valeurs** immuables, validés à la construction (`CharacterName.create(...)`).
- **Règles de jeu** en méthodes du domaine ou fonctions pures ; paramètres de `rules.md` dans
  `src/shared/domain/game-rules.ts`, jamais de valeur magique ailleurs.
- **Concurrence :** tout état lu puis modifié est verrouillé dans la transaction (`SELECT … FOR UPDATE` via
  `findByIdForUpdate`). Limite de 5 personnages : verrou sur le compte. Combat : verrou sur le combat, puis sur le
  personnage (toujours dans cet ordre).
- **Erreurs :** le domaine lève `DomainError(code, kind)` sans connaître HTTP ; un seul middleware traduit `kind`
  en statut. Une erreur de programmation (invariant violé) est une erreur ordinaire → 500. Un code partagé par deux
  contextes (`CHARACTER_NOT_FOUND`) est déclaré dans chacun, avec le même code et le même message.
- **Lecture simple** (classes, monstres d'une zone) : un cas d'usage de lecture appelle un repository, sans agrégat.
- TypeScript strict, sans `any` ni transtypage injustifié.

## 5. Sécurité (règles permanentes)

- Mots de passe hachés ; jamais renvoyés ni journalisés.
- Aucune réponse ne contient de secret, hash, jeton non voulu, variable d'environnement, trace ou requête SQL.
- Aucun log ne contient de mot de passe, jeton, cookie, corps ou paramètre de requête, ni d'URL de connexion.
- Propriété vérifiée dans chaque cas d'usage : la ressource d'un autre joueur est traitée exactement comme une
  ressource inexistante.
- Tout champ ou paramètre inconnu est refusé (400), jamais ignoré.

## 6. Tests

| Dossier | Contenu | Commande |
|---|---|---|
| `tests/unit/domain/` | Agrégats et objets-valeurs, sans aucun double | `npm test` |
| `tests/unit/application/` | Cas d'usage avec repositories en mémoire (`tests/fakes/`) | `npm test` |
| `tests/integration/` | HTTP avec Supertest et repositories en mémoire ; jamais d'import de `main.ts` | `npm test` |
| `tests/database/` | Repositories Prisma, concurrence, annulation de transaction, sur `mmorpg_test` uniquement | `npm run test:db` |
| `tests/architecture.test.ts` | Règle de dépendance des couches | `npm test` |

- Les exemples chiffrés de `rules.md` sont des tests obligatoires.
- Un même contrat de repository s'exécute sur la version en mémoire et sur la version Prisma.
- Ne jamais annoncer un test qui n'a pas été exécuté. Une compilation ne remplace pas les tests.

## 7. Méthode de travail

Un **lot** = les tickets d'une journée de `Backlog.md`. Une session par lot.

| Phase | Commande | Fin de phase |
|---|---|---|
| 1. Audit (mode Plan) | `/audit-lot LN` | Décisions D et adaptations E validées par l'utilisateur |
| 2. Réalisation | demande en texte libre, puis `/verifier` et l'agent `relecteur` | Bilan : fichiers, tests exécutés, diff, points restants |
| 3. Livraison | `/livrer-lot LN` | Hash du commit, push, arbre propre |

- Pendant la réalisation : avancer sans confirmation intermédiaire ; s'arrêter seulement sur un blocage ou une
  décision imprévue.
- Le commit et le push demandent chacun une **autorisation explicite**. Le silence n'est jamais une validation.

## 8. Garde-fous

Les commandes destructives sont bloquées par `.claude/settings.json`. En plus :
- Ne modifier aucun fichier hors du périmètre du lot validé.
- Migration : la générer, la relire, vérifier les données de `mmorpg_dev`, puis l'appliquer.
- Tests manuels : serveur compilé sur `mmorpg_test`, comptes `*.lN@example.com`, nettoyage ciblé à la fin.
- Ne jamais arrêter un processus que l'agent n'a pas lancé lui-même.
- Une vérification impossible est signalée comme telle, jamais présentée comme réussie.

## 9. Git

- Branche `main`, un commit par lot : Conventional Commits en français avec les tickets,
  par exemple `feat: combat tour par tour (WORLD-01, COMBAT-01 à COMBAT-03)`.
- Jamais `.env`, secrets, `node_modules/` ou `dist/`.

## 10. Communication

- Français, précis, direct et pédagogique ; tableaux courts.
- Distinguer ce qui a été vérifié, ce qui est proposé et ce qui reste à faire.
