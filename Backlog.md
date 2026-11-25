# Backlog — API MMORPG (4 jours)

> **19 tickets** en 4 lots, un par jour. Objectif : un parcours jouable complet, propre et testé.
> Le statut de chaque ticket est tenu **ici et seulement ici**.
> Règles : `docs/rules.md` · Architecture : `docs/architecture.md` · Contrat HTTP : `docs/conventions.md`.
> Légende : ⏳ à faire · 🔄 en cours · 👀 en attente de validation · ✅ validé · ⏸ hors projet

## 1. Définition de « terminé »

Avec la collection Postman uniquement, sur une base fraîchement initialisée :
inscription → connexion → création d'un personnage → statistiques → monstres de la zone → combat tour par tour
→ victoire (XP, niveau, objet dans l'inventaire) ou défaite → état mis à jour.

Hors projet : voir `docs/rules.md` §1.

## 2. Lots

| Jour | Lot | Tickets | Résultat en fin de journée | Statut | Commit |
|---|---|---|---|---|---|
| 1 | L1 Socle et identité | ARCH-01 à ARCH-04, ID-01 à ID-03 | Structure en couches validée, base prête, inscription et connexion | ✅ | a4deeb2 |
| 2 | L2 Personnages | CHAR-01 à CHAR-04 | Créer et consulter ses personnages, statistiques et progression | ✅ | 9717d55 |
| 3 | L3 Monde et combat | WORLD-01, COMBAT-01 à COMBAT-03 | Combat jouable jusqu'à la victoire ou la défaite | ⏳ | — |
| 4 | L4 Récompenses et livraison | REWARD-01, INV-01, DOC-01, QUAL-01 | Parcours complet, collection Postman, README | ⏳ | — |

Chaque journée garde environ 1 h de marge. Décisions de chaque lot : `docs/lots/LN.md`.

## 3. Écarts au backlog

Uniquement ce qui modifie un ticket : critère reporté, code ou statut différent, ticket réduit.

| Ticket | Écart | Raison | Reprise |
|---|---|---|---|
| ARCH-03 | Migration initiale sans les tables de combat ni d'inventaire (L1 E1) | Agrégats `Combat` et `Inventory` pas encore conçus | Migrations de COMBAT-01/02 (L3) et INV-01 (L4) |
| CHAR-02 | Critère « inventaire vide » reporté : pas encore de table d'inventaire (L2 E1) | Agrégat `Inventory` conçu en L4 | INV-01 : un personnage sans ligne d'inventaire a un inventaire vide |

---

## 4. Tickets

Format : **Objectif**, **Critères** (3 à 5), **Tests**. Les exemples chiffrés de `rules.md` cités sont des tests obligatoires.

### Jour 1 — Socle et identité

#### ARCH-01 — Projet et squelette de référence
**Statut :** ✅ · **Dépend de :** —
**Objectif :** projet TypeScript strict structuré selon `docs/architecture.md`, avec un premier exemple complet validé.
**Critères :**
- [x] Node 22, TypeScript strict, ESM ; scripts `dev`, `build`, `start`, `typecheck`, `test`.
- [x] `.gitignore` (`node_modules/`, `dist/`, `.env`, client Prisma généré), `.gitattributes` (fins de ligne LF), `.env.example` commenté, `docker-compose.yml` (PostgreSQL 18, bases `mmorpg_dev` et `mmorpg_test`).
- [x] Arborescence de `docs/architecture.md` §1 ; `DomainError` et traduction des erreurs prêtes.
- [x] `tests/architecture.test.ts` échoue si une couche importe une dépendance interdite.
- [x] `GET /health` → 200, construit selon le chemin complet `interfaces → application`.
**Tests :** règle de dépendance (y compris un cas volontairement fautif), `/health`.
**À valider avant la suite :** le squelette sert de modèle à tous les tickets.

#### ARCH-02 — Contrat HTTP et erreurs
**Statut :** ✅ · **Dépend de :** ARCH-01
**Objectif :** enveloppes, validation stricte, traduction `DomainError` → statut, conformes à `docs/conventions.md`.
**Critères :**
- [x] Middleware `validate` (Zod strict) : champ inconnu → 400 `VALIDATION_ERROR` avec `details`.
- [x] Un seul middleware traduit `kind` en 401, 404, 409, 422 ; toute autre erreur → 500 générique.
- [x] Erreurs des handlers asynchrones interceptées ; JSON invalide → 400 `INVALID_JSON` ; route inconnue → 404.
**Tests :** chaque ligne de `docs/conventions.md` §5.

#### ARCH-03 — Base de données, seed et unité de travail
**Statut :** ✅ · **Dépend de :** ARCH-01 · **Règles :** §3, §8
**Objectif :** PostgreSQL (Docker), Prisma, schéma initial, données de référence, `UnitOfWork`.
**Critères :**
- [x] Migration initiale (comptes, sessions, classes, personnages, zones, monstres, objets, combats, inventaires) avec contraintes `CHECK` des invariants simples.
- [x] Seed idempotent conforme à `rules.md` §3 et §8.
- [x] `UnitOfWork` Prisma et en mémoire ; base `mmorpg_test` protégée (URL et `current_database()`).
**Tests :** seed lancé deux fois sans doublon ; transaction annulée sur erreur (Prisma et mémoire).

#### ARCH-04 — Sécurité HTTP et logs
**Statut :** ✅ · **Dépend de :** ARCH-02
**Objectif :** protections de `docs/conventions.md` §7.
**Critères :**
- [x] Helmet, CORS, JSON 10 Ko (413), `Content-Type` contrôlé (415), limitation du débit (429, `Retry-After`).
- [x] Logs Pino avec `X-Request-Id`, sans corps, jeton, mot de passe ni URL de connexion.
**Tests :** 413, 415, 429 ; capture des logs.

#### ID-01 — Inscription
**Statut :** ✅ · **Dépend de :** ARCH-02, ARCH-03
**Objectif :** cas d'usage `RegisterAccount`, `POST /api/v1/auth/register`.
**Critères :**
- [x] Objet-valeur `Email` (minuscules) ; mot de passe de 15 à 128 caractères.
- [x] Hachage Argon2id derrière le port `PasswordHasher` ; ni mot de passe ni hash dans la réponse.
- [x] Email déjà utilisé, y compris en concurrence → 409 `EMAIL_ALREADY_USED`.
**Tests :** objets-valeurs ; cas d'usage avec faux ; HTTP 201, 400, 409.

#### ID-02 — Connexion
**Statut :** ✅ · **Dépend de :** ID-01
**Objectif :** cas d'usage `Login`, `POST /api/v1/auth/login`, jeton opaque de 24 h.
**Critères :**
- [x] Email inconnu et mauvais mot de passe → même 401 `INVALID_CREDENTIALS`.
- [x] Jeton généré par le port `TokenGenerator` ; seule son empreinte SHA-256 est stockée ; expiration par le port `Clock`.
**Tests :** succès, 401 identiques, jeton absent de la base en clair.

#### ID-03 — Routes protégées
**Statut :** ✅ · **Dépend de :** ID-02
**Objectif :** cas d'usage `Authenticate`, middleware `requireAuth`, `GET /api/v1/auth/me`.
**Critères :**
- [x] Jeton absent, invalide ou expiré → 401 `UNAUTHENTICATED` avec `WWW-Authenticate`.
- [x] Les cas d'usage reçoivent `accountId`, jamais un objet Express.
**Tests :** 401 (absent, invalide, expiré avec une horloge de test), 200 sur `/me`.

### Jour 2 — Personnages

#### CHAR-01 — Catalogue des classes
**Statut :** ✅ · **Dépend de :** ARCH-03 · **Règles :** §3
**Objectif :** `GET /api/v1/classes` (public), lecture des données de référence.
**Critères :**
- [x] Les 3 classes avec statistiques de niveau 1 et gains par niveau ; aucune route d'écriture.
**Tests :** forme exacte, valeurs de `rules.md` §3.

#### CHAR-02 — Créer un personnage
**Statut :** ✅ · **Dépend de :** CHAR-01, ID-03 · **Règles :** §4
**Objectif :** agrégat `Character`, cas d'usage `CreateCharacter`, `POST /api/v1/characters` (exemple de `docs/architecture.md`).
**Critères :**
- [x] `CharacterName` (3 à 16 lettres) ; nom unique sans tenir compte de la casse → 409 `CHARACTER_NAME_TAKEN`.
- [x] 5 personnages au plus par compte, **même en concurrence** → 409 `CHARACTER_LIMIT_REACHED`.
- [x] Niveau 1, XP 0, zone de départ, inventaire vide ; propriétaire tiré du jeton ; classe inconnue → 422 `CLASS_NOT_FOUND`.
**Tests :** objets-valeurs ; cas d'usage ; HTTP ; PostgreSQL : 8 créations simultanées → exactement 5.

#### CHAR-03 — Consulter ses personnages
**Statut :** ✅ · **Dépend de :** CHAR-02
**Objectif :** `GET /api/v1/characters` et `GET /api/v1/characters/:characterId`.
**Critères :**
- [x] Seulement les personnages du compte ; celui d'un autre joueur → même 404 `CHARACTER_NOT_FOUND` qu'un inexistant.
**Tests :** liste vide, isolation entre comptes, réponses 404 identiques.

#### CHAR-04 — Statistiques et progression
**Statut :** ✅ · **Dépend de :** CHAR-03 · **Règles :** §3, §5
**Objectif :** objets-valeurs `Stats` et `Progression`, `Character.gainExperience`, `GET /api/v1/characters/:characterId/stats`.
**Critères :**
- [x] `Stats.forLevel(classe, niveau)` = base + gain × (niveau − 1) ; jamais stockées ; ressources = maximum.
- [x] `Progression.gain(xp)` : passages multiples, niveau 10 avec XP 0, gain entier sûr ≥ 1.
- [x] Aucune route ne modifie le niveau ou l'XP.
**Tests :** tableau d'XP de §5, exemple 90 + 300 → niveau 3 avec 7 XP, niveaux 1, 5 et 10 des 3 classes.

### Jour 3 — Monde et combat

#### WORLD-01 — Monstres d'une zone
**Statut :** ✅ · **Dépend de :** ARCH-03, ID-03 · **Règles :** §8
**Objectif :** `GET /api/v1/zones/:zoneId/monsters`.
**Critères :**
- [x] Les 3 monstres de la Clairière avec leurs statistiques ; zone inconnue → 404 `ZONE_NOT_FOUND`.
**Tests :** valeurs du seed, 404.

#### COMBAT-01 — Agrégat `Combat`
**Statut :** ✅ · **Dépend de :** CHAR-04 · **Règles :** §6
**Objectif :** agrégat `Combat` **pur** : initiative, dégâts, alternance, états. Aucune base, aucune route.
**Critères :**
- [x] Statistiques des deux participants figées à la création ; initiative au plus rapide, égalité → personnage.
- [x] Dégâts `max(1, ⌊attaque × 100 / (100 + défense)⌋)` ; PV bornés à 0.
- [x] `IN_PROGRESS` → `VICTORY` / `DEFEAT`, terminaux ; action sur un combat terminé → `COMBAT_FINISHED`.
**Tests :** tableau des dégâts de §6, exemple complet loup contre guerrier de §8 (92 PV restants).

#### COMBAT-02 — Démarrer un combat
**Statut :** ✅ · **Dépend de :** COMBAT-01, WORLD-01
**Objectif :** cas d'usage `StartCombat`, `POST /api/v1/combats` (`characterId`, `monsterId`).
**Critères :**
- [x] Personnage inexistant ou d'un autre joueur → 422 `CHARACTER_NOT_FOUND` ; monstre hors zone → 422 `MONSTER_NOT_IN_ZONE`.
- [x] Un seul combat `IN_PROGRESS` par personnage, même en concurrence (verrou sur le personnage) → 409 `CHARACTER_ALREADY_IN_COMBAT`.
- [x] Si le monstre commence, son premier tour est joué dans la même requête.
**Tests :** cas d'usage, HTTP, PostgreSQL : 2 démarrages simultanés → 1 seul combat.

#### COMBAT-03 — Jouer un tour et consulter un combat
**Statut :** ✅ · **Dépend de :** COMBAT-02
**Objectif :** `POST /api/v1/combats/:combatId/actions` (`{ "type": "ATTACK" }`) et `GET /api/v1/combats/:combatId`.
**Critères :**
- [x] Le joueur attaque, le monstre riposte dans la même réponse ; combat d'un autre joueur → 404 `COMBAT_NOT_FOUND`.
- [x] Action sur un combat terminé → 422 `COMBAT_FINISHED`.
- [x] Deux actions simultanées : le combat est verrouillé (`findByIdForUpdate`), elles s'exécutent l'une après l'autre.
- [x] Fin du combat : PV et mana du personnage remis au maximum (rien n'est stocké).
**Tests :** parcours jusqu'à `VICTORY` et jusqu'à `DEFEAT`, 404, 422, concurrence sur PostgreSQL.

### Jour 4 — Récompenses et livraison

#### REWARD-01 — Récompenses de victoire
**Statut :** ⏳ · **Dépend de :** COMBAT-03 · **Règles :** §7
**Objectif :** à la victoire, XP et butin attribués **une seule fois**, dans la même transaction que l'action finale.
**Critères :**
- [ ] Un seul `UnitOfWork` : action finale + `Character.gainExperience` + ajout à l'inventaire.
- [ ] Tirage du butin par le port `RandomSource` ; défaite → aucune récompense.
- [ ] Panne injectée pendant la transaction → rien n'est écrit ; les récompenses ne sont jamais attribuées deux fois.
- [ ] La réponse de l'action finale indique l'XP gagnée, les niveaux gagnés et l'objet obtenu.
**Tests :** tirage forcé à 0,31 (objet) et 0,9 (rien), passage de niveau, panne injectée, deux actions simultanées.

#### INV-01 — Inventaire
**Statut :** ⏳ · **Dépend de :** REWARD-01 · **Règles :** §10
**Objectif :** agrégat `Inventory` et `GET /api/v1/characters/:characterId/inventory`.
**Critères :**
- [ ] Objets empilés par type (quantité), sans limite ; seulement pour le propriétaire (sinon 404 `CHARACTER_NOT_FOUND`).
**Tests :** empilement, isolation entre joueurs.

#### DOC-01 — Collection Postman et README
**Statut :** ⏳ · **Dépend de :** INV-01
**Objectif :** collection Postman du parcours de la section 1 (variables, tests de statut) et README à jour.
**Critères :**
- [ ] Le Runner Postman exécute le parcours complet, victoire et défaite, sur une base fraîchement initialisée.
- [ ] Le README décrit installation, commandes, couches et contextes.
**Tests :** exécution du Runner.

#### QUAL-01 — Revue finale
**Statut :** ⏳ · **Dépend de :** DOC-01
**Objectif :** vérifier la qualité avant la livraison.
**Critères :**
- [ ] `/verifier` entièrement au vert.
- [ ] Revue par l'agent `relecteur` sur l'ensemble du projet ; problèmes corrigés ou listés.
- [ ] Propriété vérifiée sur chaque route ; aucune donnée sensible exposée ou journalisée.
**Tests :** exécution complète.

---

## 5. Bonus (si du temps reste, dans cet ordre)

| Ticket | Contenu |
|---|---|
| BONUS-01 | Déconnexion (`POST /api/v1/auth/logout`, 204, révocation de la session) |
| BONUS-02 | Historique des actions d'un combat |
| BONUS-03 | Attribution par un événement de domaine interne `CombatWon` |
