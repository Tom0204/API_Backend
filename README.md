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

Vérification : `GET http://localhost:4001/health` → `200`. Parcours complet : collection Postman `postman/`.

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

Clean Architecture en quatre couches (`domain`, `application`, `infrastructure`, `interfaces/http`) et cinq contextes
(`identity`, `characters`, `world`, `combat`, `inventory`). Détail : `docs/architecture.md`.

## Variables d'environnement

Voir `.env.example`. Obligatoire hors tests : `DATABASE_URL`. Tests base : `TEST_DATABASE_URL`
(base `mmorpg_test` exactement, toute autre valeur est refusée).
