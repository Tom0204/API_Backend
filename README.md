# API MMORPG

API REST d'un MMORPG (backend uniquement) : comptes, personnages, statistiques, combat tour par tour, butin.
Règles de jeu : `docs/rules.md` · Architecture : `docs/architecture.md` · Contrat HTTP : `docs/conventions.md`
· Avancement : `Backlog.md`.

## Prérequis

- Node.js 22 et npm
- Docker Desktop (PostgreSQL 18)

## Installation

```powershell
npm install
Copy-Item .env.example .env   # puis choisir un mot de passe PostgreSQL
npm run db:up                 # conteneur PostgreSQL (bases mmorpg_dev et mmorpg_test)
npm run db:migrate            # migrations
npm run db:seed               # données de référence et premier administrateur (idempotent)
npm run dev
```

Vérification : `GET http://localhost:4001/health` → `200`.

Documentation interactive (hors production) : `http://localhost:4001/docs` (Swagger UI, OpenAPI 3.1) ;
spécification brute : `/docs/openapi.json`.

## Parcours avec Postman

Importer `postman/mmorpg-api.postman_collection.json`, puis lancer la collection entière avec le **Runner**, dans l'ordre :
inscription → connexion → personnage → statistiques → monstres de la zone → combat contre le loup jusqu'à la victoire
(25 XP, butin aléatoire) → inventaire → mage contre le bandit jusqu'à la défaite (ni XP ni butin).
Les emails et noms sont générés à chaque exécution : aucune remise à zéro de la base n'est nécessaire.

- Variable `baseUrl` : `http://localhost:4001` par défaut.
- Dossier L7 : renseigner les variables `adminEmail` et `adminPassword` avec `ADMIN_EMAIL` et `ADMIN_PASSWORD` du `.env`
  (administrateur créé par `npm run db:seed`).
- Dossier L8 : historique du dernier combat et classement (pagination par `limit` et `offset`).
- L'inscription et la connexion sont limitées chacune à 10 requêtes par 15 minutes et par IP (`docs/conventions.md` §7) :
  une exécution complète consomme 3 inscriptions et 8 connexions, la deuxième exécution en 15 minutes reçoit donc `429`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Démarrage en développement |
| `npm run typecheck` | Vérification TypeScript |
| `npm run build` / `npm start` | Compilation vers `dist/server.cjs`, puis démarrage |
| `npm test` | Tests sans base (domaine, cas d'usage, HTTP, architecture) |
| `npx vitest run --sequence.shuffle` | Mêmes tests, en ordre aléatoire |
| `npm run test:db` | Tests PostgreSQL, sur `mmorpg_test` uniquement |
| `npm run db:up` / `db:down` | Démarrer / arrêter PostgreSQL (les données sont conservées) |
| `npm run db:migrate`, `db:status`, `db:generate` | Migrations et client Prisma |
| `npm run db:seed` | Données de référence ; administrateur si `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont définis |
| `npm run db:reset` | **Destructif** : efface la base de développement |

## Architecture

Clean Architecture et DDD, organisées **par contexte**. Détail et exemple de référence : `docs/architecture.md`.

| Dossier | Contient | Dépend de |
|---|---|---|
| `src/shared/` | Noyau commun : `DomainError`, paramètres de `rules.md`, ports `UnitOfWork`, `Clock`, `RandomSource` | rien |
| `src/contexts/X/domain/` | Agrégats, objets-valeurs, règles de jeu, erreurs métier du contexte | `shared` |
| `src/contexts/X/app/` | Cas d'usage (entrée, sortie, `execute`), `interfaces/` (repositories, outils, besoins envers les autres contextes), `services/` (ce que le contexte offre aux autres), `handlers/` (réactions aux événements), `utils/` | son `domain`, `shared` |
| `src/contexts/X/api/` | Routes Express, schémas Zod, présentateurs | son `app`, `platform/http` |
| `src/contexts/X/infra/` | Repositories Prisma, adaptateurs (Argon2, jetons) | son `app`, `platform/prisma` |
| `src/platform/` | Express (`app.ts`, middlewares, spécification OpenAPI dans `http/openapi/`), Prisma (`UnitOfWork`), publieur et registre des événements (`events/`), horloge, aléatoire, logs, et `transaction.ts` : seul endroit qui relie les contextes | tout |
| `src/main.ts` | Composition : construit l'infrastructure et l'injecte | tout |

**Aucun contexte n'importe un autre contexte** : il déclare ce dont il a besoin dans ses `app/interfaces`, et le contexte
qui possède la donnée le fournit par un service. Règle vérifiée par `tests/architecture.test.ts`.

| Contexte | Rôle |
|---|---|
| `identity` | Comptes, jetons d’accès et de rafraîchissement, déconnexion, verrouillage après échecs, permissions et administration des comptes |
| `characters` | Classes, personnages, statistiques calculées, progression (XP, niveaux), classement |
| `world` | Zones et modèles de monstres, avec leur butin |
| `combat` | Combat tour par tour ; la victoire publie `CombatWon`, qui déclenche XP et butin dans la même transaction |
| `inventory` | Inventaire d'un personnage, objets empilés par type |
| `journal` | Journal des événements de jeu (création, combats, tours, récompenses) ; fournit au combat son historique |

## Variables d'environnement

Voir `.env.example`. Obligatoire hors tests : `DATABASE_URL`. Tests base : `TEST_DATABASE_URL`
(base `mmorpg_test` exactement, toute autre valeur est refusée). Premier administrateur : `ADMIN_EMAIL` et `ADMIN_PASSWORD`
(facultatifs, ensemble ; lus par `npm run db:seed`, qui ne modifie jamais un compte existant).
