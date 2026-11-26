# API MMORPG

API REST d'un MMORPG (backend uniquement) : comptes, personnages, combat tour par tour, butin, classement.

## Prérequis

- Node.js 22 et npm
- Docker Desktop, démarré

## Installation

```powershell
npm install
Copy-Item .env.example .env
```

Dans `.env`, choisir un mot de passe PostgreSQL et le reporter dans les trois variables qui le contiennent :
`POSTGRES_PASSWORD`, `DATABASE_URL` et `TEST_DATABASE_URL`.
Pour exécuter toute la collection Postman, renseigner aussi `ADMIN_EMAIL` et `ADMIN_PASSWORD`
(15 caractères au moins) : ce compte administrateur est créé par le seed.

```powershell
npm run db:up         # PostgreSQL dans Docker (bases mmorpg_dev et mmorpg_test)
npm run db:migrate    # crée les tables
npm run db:generate   # génère le client Prisma
npm run db:seed       # classes, zone, monstres, objets et administrateur
```

## Lancement

```powershell
npm run dev
```

- `http://localhost:4001/health` → `200` : l'API répond.
- `http://localhost:4001/docs` : documentation interactive (Swagger UI) de toutes les routes.

## Tester

| Commande | Rôle |
|---|---|
| `npm test` | Tests sans base de données |
| `npm run test:db` | Tests sur PostgreSQL (base `mmorpg_test`) |

**Postman** : importer `postman/mmorpg-api.postman_collection.json` et lancer toute la collection avec le **Runner**,
dans l'ordre. Elle joue le parcours complet : inscription, connexion, personnage, combat jusqu'à la victoire et
jusqu'à la défaite, inventaire, administration, historique de combat et classement.

- La variable `baseUrl` vaut `http://localhost:4001`.
- Renseigner les variables `adminEmail` et `adminPassword` avec les valeurs du `.env`.
- La connexion est limitée à 10 requêtes par 15 minutes et par IP : attendre 15 minutes avant de relancer la collection.

## Arrêt

```powershell
npm run db:down       # arrête PostgreSQL ; les données sont conservées
```
