# Conventions de l'API

Contrat HTTP commun à tous les endpoints. Le **catalogue des routes** n'est pas tenu ici : il vit dans la
spécification OpenAPI (`src/platform/http/openapi/`, servie sur `/docs`) et dans la collection Postman (`postman/`).

## 1. Routes

- Toutes les routes métier sont sous `/api/v1`. `GET /health` est hors préfixe et non limité.
- `/docs` (Swagger UI) et `/docs/openapi.json` : publics, hors préfixe, non limités, absents quand `NODE_ENV=production`
  (`docs/lots/L8.md` D7).
- **Publiques :** `GET /health`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`,
  `GET /api/v1/classes`.
  **Toutes les autres** exigent `Authorization: Bearer <jeton d’accès>` ; sinon 401 avec `WWW-Authenticate: Bearer realm="api"`.
- **Permissions** (ROLE-02, `docs/lots/L7.md` D1-D2), relues en base à chaque requête : `PLAY` pour les routes de jeu
  (personnages, classement, zones, combats, inventaire) ; `/api/v1/admin/*` exige la permission propre à chaque route ; sinon 403.
- Le jeton de rafraîchissement ne sert qu’à `POST /api/v1/auth/refresh` (corps `{ "refreshToken" }`), jamais en `Bearer`.
  Jeton inconnu, expiré, révoqué ou déjà utilisé : même 401 `UNAUTHENTICATED`.

| Élément | Convention | Exemple |
|---|---|---|
| Segments d'URL | pluriel, kebab-case | `/characters`, `/combats` |
| Paramètres de chemin | nom explicite | `:characterId`, `:combatId` |
| Champs JSON, paramètres de requête | camelCase | `currentZoneId` |
| Énumérations | `UPPER_SNAKE_CASE` | `IN_PROGRESS`, `ATTACK` |
| Action hors CRUD | sous-ressource en `POST` | `POST /api/v1/combats/:combatId/actions` |

## 2. Requêtes

- Corps en JSON uniquement (sinon 415), 10 Ko au plus (sinon 413).
- Validation Zod **stricte** des `params`, `query` et `body` : tout champ inconnu → 400.
- Le client ne fournit jamais une valeur calculée par le serveur (niveau, XP, dégâts, PV, propriétaire) : refusée en 400.
- Identifiants : chaînes opaques (UUID v7) ; format invalide → 400. Un UUID ne remplace jamais un contrôle de droits.
- En-tête `X-Request-Id` facultatif en requête, toujours renvoyé en réponse.

## 3. Réponses de succès

```json
{ "success": true, "message": "Character retrieved successfully", "data": { } }
```

- `201` pour une création (ressource dans `data`) ; `204` sans corps pour une déconnexion (seule exception à l'enveloppe).
- Une liste est un tableau dans `data` ; vide → `200` avec `[]`. Pas de pagination dans ce projet (listes courtes),
  **sauf** `GET /api/v1/leaderboard` : `?limit=` de 1 à 100 (20 par défaut) et `?offset=` ≥ 0 (0 par défaut) ;
  `data` reste un tableau, sans total (`docs/lots/L8.md` D3).
- Chaque ressource passe par un présentateur (liste blanche de champs). Les champs prévus sont toujours présents (`null` si vides).
- Dates en ISO 8601 UTC (`2026-11-17T11:43:00.000Z`), champs suffixés `At`.

## 4. Réponses d'erreur

```json
{ "success": false, "message": "Validation failed", "error": { "code": "VALIDATION_ERROR", "details": [ { "field": "name", "message": "Must be 3 to 16 letters (A-Z, a-z)" } ] } }
```

- `details` est toujours un tableau (vide hors validation). Messages et codes en anglais.
- Une erreur 500 renvoie toujours `Internal server error` / `INTERNAL_ERROR`, sans aucun détail interne.

## 5. Statuts HTTP

Le domaine lève une `DomainError` avec un `kind` ; un seul middleware la traduit :

| `kind` (domaine) | Statut | Usage |
|---|---|---|
| — (validation Zod) | 400 | Requête invalide **quel que soit l'état du serveur** |
| `UNAUTHENTICATED` | 401 | Authentification absente, invalide ou expirée, ou compte suspendu |
| `FORBIDDEN` | 403 | Permission absente (`requirePermission`), ou compte visé plus privilégié que l'acteur |
| `NOT_FOUND` | 404 | Ressource **de l'URL** inexistante **ou d'un autre joueur** |
| `CONFLICT` | 409 | Unicité, limite atteinte, ressource déjà engagée |
| `RULE_VIOLATION` | 422 | Condition de jeu non remplie, ou ressource **du corps** introuvable ou d'un autre joueur |
| — | 413 / 415 / 429 | Corps trop gros / format refusé / trop de requêtes (`Retry-After`) |
| autre erreur | 500 | Erreur inattendue ou invariant violé |

**Ressource inaccessible = ressource inexistante** : même statut, même code, même message.

## 6. Codes d'erreur

**Génériques :** `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHENTICATED`, `ROUTE_NOT_FOUND`, `PAYLOAD_TOO_LARGE`,
`UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `INTERNAL_ERROR`, `FORBIDDEN` (403, permission insuffisante, ROLE-02).

**Métier** (chaque lot complète ce tableau) :

| Code | Statut | Cas | Ticket |
|---|---|---|---|
| `EMAIL_ALREADY_USED` | 409 | Inscription avec un email déjà pris | ID-01 |
| `INVALID_CREDENTIALS` | 401 | Email inconnu ou mot de passe faux (même réponse) | ID-02 |
| `CHARACTER_NAME_TAKEN` | 409 | Nom déjà pris, quelle que soit la casse | CHAR-02 |
| `CHARACTER_LIMIT_REACHED` | 409 | 5 personnages déjà créés | CHAR-02 |
| `CLASS_NOT_FOUND` | 422 | `classId` inconnu dans le corps | CHAR-02 |
| `CHARACTER_NOT_FOUND` | 404 / 422 | Personnage inexistant ou d'un autre joueur (URL / corps) | CHAR-03, COMBAT-02, INV-01 |
| `ZONE_NOT_FOUND` | 404 | Zone inconnue | WORLD-01 |
| `MONSTER_NOT_IN_ZONE` | 422 | Monstre inconnu ou absent de la zone du personnage | COMBAT-02 |
| `CHARACTER_ALREADY_IN_COMBAT` | 409 | Le personnage a déjà un combat `IN_PROGRESS` | COMBAT-02 |
| `COMBAT_NOT_FOUND` | 404 | Combat inexistant ou d'un autre joueur | COMBAT-03 |
| `COMBAT_FINISHED` | 422 | Action sur un combat terminé | COMBAT-03 |
| `ACCOUNT_NOT_FOUND` | 404 | Compte visé par une route d'administration inexistant | ROLE-03 |
| `SELF_ADMINISTRATION_REFUSED` | 422 | Suspension, réactivation ou changement de rôle de son propre compte | ROLE-03 |

## 7. Protections

- Helmet, CORS selon `CORS_ORIGINS` (aucune origine externe en production si absente), JSON 10 Ko, contrôle du `Content-Type`.
- Limitation : 300 requêtes par minute et par IP sur `/api/v1` ; 10 par 15 minutes sur `register`, `login` et `refresh`
  (chacun son compteur).
- Logs : jamais de corps, paramètres, mots de passe, jetons, cookies ni URL de connexion.

## 8. Liste de contrôle d'un nouvel endpoint

- [ ] Chemin conforme (§1), protégé sauf mention contraire.
- [ ] Schémas Zod stricts pour `params`, `query`, `body`.
- [ ] Propriété vérifiée dans le cas d'usage ; 404 ou 422 identiques pour une ressource inaccessible.
- [ ] Réponse par présentateur dans l'enveloppe ; nouveaux codes ajoutés au §6.
- [ ] Tests : succès, 400, 401, ressource d'un autre joueur, cas métier ; requête ajoutée à la collection Postman.
