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
npm run db:seed               # données de référence (idempotent)
npm run dev
```

Vérification : `GET http://localhost:4001/health` → `200`.

## Parcours avec Postman

Importer `postman/mmorpg-api.postman_collection.json`, puis lancer la collection entière avec le **Runner**, dans l'ordre :
inscription → connexion → personnage → statistiques → monstres de la zone → combat contre le loup jusqu'à la victoire
(25 XP, butin aléatoire) → inventaire → mage contre le bandit jusqu'à la défaite (ni XP ni butin).
Les emails et noms sont générés à chaque exécution : aucune remise à zéro de la base n'est nécessaire.

- Variable `baseUrl` : `http://localhost:4001` par défaut.
- L'inscription et la connexion sont limitées chacune à 10 requêtes par 15 minutes et par IP (`docs/conventions.md` §7) :
  une exécution complète en consomme 3 de chaque, la quatrième exécution en 15 minutes reçoit donc `429`.

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
| `npm run db:seed` | Données de référence |
| `npm run db:reset` | **Destructif** : efface la base de développement |

## Architecture

Clean Architecture et DDD. Détail et exemple de référence : `docs/architecture.md`.

| Couche | Contient | Dépend de |
|---|---|---|
| `src/domain/` | Agrégats, objets-valeurs, règles de jeu, erreurs métier, interfaces des repositories | rien |
| `src/application/` | Un cas d'usage par action ; ports `UnitOfWork`, `Clock`, `RandomSource`, `PasswordHasher`, `TokenGenerator` | `domain` |
| `src/infrastructure/` | Prisma (repositories, transactions), Argon2, horloge, aléatoire, logs | `domain`, `application` |
| `src/interfaces/http/` | Routes Express, schémas Zod, présentateurs, middlewares | `application` |
| `src/main.ts` | Composition : construit l'infrastructure et l'injecte | tout |

La règle de dépendance est vérifiée par `tests/architecture.test.ts`.

| Contexte | Rôle |
|---|---|
| `identity` | Comptes, sessions opaques de 24 h, authentification |
| `characters` | Classes, personnages, statistiques calculées, progression (XP, niveaux) |
| `world` | Zones et modèles de monstres, avec leur butin |
| `combat` | Combat tour par tour, récompenses de victoire (XP et butin dans une seule transaction) |
| `inventory` | Inventaire d'un personnage, objets empilés par type |

## Variables d'environnement

Voir `.env.example`. Obligatoire hors tests : `DATABASE_URL`. Tests base : `TEST_DATABASE_URL`
(base `mmorpg_test` exactement, toute autre valeur est refusée).
