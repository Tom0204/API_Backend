# Guide : réutiliser ce dossier pour un projet avec un agent IA

Ce fichier n'est pas destiné à l'agent : il explique **à toi** le rôle de chaque fichier et la façon de travailler.
Pour démarrer le projet : copier le contenu de ce dossier (y compris `.claude/`) à la racine d'un dépôt vide,
puis lancer le lot L1.

## 1. Qui lit quoi, et quand

| Fichier | Chargé | Contenu | Le modifier quand… |
|---|---|---|---|
| `CLAUDE.md` → importe `AGENTS.md` | **À chaque session**, automatiquement | Règles stables : stack, architecture, sécurité, méthode | Une règle change pour de bon. Jamais pour noter un avancement. |
| `docs/rules.md`, `docs/architecture.md`, `docs/conventions.md` | **À la demande** : l'agent les lit parce qu'AGENTS.md les cite | Règles de jeu, exemple de code, contrat HTTP | Un lot ajoute une règle ou un code d'erreur |
| `Backlog.md` | À la demande (audit, livraison) | Tickets et **seul état d'avancement** | À chaque livraison (statuts) |
| `docs/lots/LN.md` | Rarement | Décisions d'un lot passé | Pendant le lot concerné |
| `.claude/skills/*/SKILL.md` | **Seulement quand tu tapes** `/nom` | Procédures répétitives | Une procédure change |
| `.claude/agents/*.md` | Quand le sous-agent est lancé | Rôle et outils d'un sous-agent | — |
| `.claude/settings.json` | Par l'outil, à chaque action | Permissions et hooks : **appliqués**, pas seulement demandés | Un nouvel interdit ou une nouvelle automatisation |
| `GUIDE.md`, `README.md` | Par les humains | — | — |

Règle d'or : **ce qui est toujours vrai** va dans `AGENTS.md` (court) ; **ce qui est une procédure** va dans une
skill ; **ce qui est un interdit** va dans `settings.json` ; **ce qui évolue** va dans le backlog et Git.

## 2. Une journée type (un lot)

| Étape | Ce que tu tapes | Ce qui se passe |
|---|---|---|
| 1 | Nouvelle session, mode Plan, puis `/audit-lot L2` | Audit d'une page, décisions D et adaptations E |
| 2 | `D1–D3 validés ; D4 : alternative B. Réalise le lot.` | Réalisation autonome : code et tests |
| 3 | `/verifier` | Typecheck, tests, tests en ordre aléatoire, PostgreSQL, build, test manuel |
| 4 | `Lance l'agent relecteur sur le lot L2.` | Revue indépendante ; l'agent principal corrige ce qui est confirmé |
| 5 | Tu lis le bilan, puis `/livrer-lot L2` | Statuts, contrôle du diff, commit, push (l'outil te demande d'accepter) |
| 6 | `/clear` ou nouvelle session | Contexte propre pour le lot suivant |

Tes prompts n'ont plus besoin de répéter « ne commite pas », « ne réinitialise pas la base » : c'est dans
`AGENTS.md` et, pour les commandes dangereuses, bloqué par `settings.json`. Tu n'écris que **ce qui est propre au lot**.

## 3. Sous-agents : utiles ou non dans ce projet ?

Un sous-agent démarre **sans l'historique de la conversation**, travaille dans son propre contexte et ne renvoie
qu'un rapport. Il est rentable quand la tâche est **séparable** et que seul le résultat compte.

| Cas | Pertinent ? | Comment |
|---|---|---|
| Revue après réalisation (étape 4) | **Oui, le meilleur usage** : il n'a pas écrit le code, il ne le défend pas | Agent personnalisé `relecteur`, ou la commande intégrée `/code-review` ; `/security-review` pour la sécurité |
| Exploration pendant l'audit des lots 3 et 4 | **Oui** : il lit 30 fichiers, tu ne gardes que la conclusion | Agent intégré `Explore` ; la skill `/audit-lot` le demande à l'étape 3 |
| Rédaction de la collection Postman (DOC-01) | Possible : tâche indépendante, au résultat vérifiable | Prompt : « délègue à un sous-agent la création de la collection Postman à partir des routes existantes » |
| Implémentation des tickets d'un lot | **Non** : fichiers et décisions partagés, il faudrait tout lui réexpliquer | Agent principal |
| Deux tickets indépendants en parallèle (WORLD-01 et COMBAT-01) | Rarement utile sur 4 jours | Plutôt une **deuxième session** dans un worktree Git, avec sa propre branche |

### Les trois façons de lancer un sous-agent

1. **Dans un prompt**, en le nommant : « Lance l'agent relecteur sur le diff du lot L2 » ou « Utilise un sous-agent
   Explore pour trouver tous les endroits qui lisent le niveau d'un personnage ». C'est la façon la plus simple.
2. **Automatiquement** : l'agent principal choisit un sous-agent quand sa `description` (en en-tête du fichier
   `.claude/agents/<nom>.md`) correspond à la tâche. Une description précise (« à utiliser après chaque réalisation »)
   rend ce choix fiable ; un nom seul ne suffit pas.
3. **Depuis une skill** : une étape de la skill le demande (`/audit-lot` délègue l'exploration à `Explore`).

Un sous-agent **ne se lance pas depuis AGENTS.md ou CLAUDE.md** au sens d'un déclenchement : ces fichiers peuvent
seulement dire *quand* il est souhaitable d'en utiliser un, ce qui oriente l'agent principal.

### Ce qui définit un sous-agent personnalisé (`.claude/agents/relecteur.md`)

| Champ | Rôle |
|---|---|
| `name` | Nom à citer dans un prompt |
| `description` | Quand l'utiliser : c'est ce que lit l'agent principal pour décider |
| `tools` | Outils autorisés ; ici lecture seule (pas `Edit` ni `Write`) pour qu'il ne puisse rien modifier |
| `model` | Modèle utilisé ; un modèle plus léger suffit pour une relecture ciblée |
| Corps du fichier | Ses instructions : référentiel, points à vérifier, format du rapport |

Coût : chaque sous-agent relit ce dont il a besoin ; en lancer pour de petites tâches revient plus cher que de les
faire directement.

## 4. Skills

- Une skill est un fichier `.claude/skills/<nom>/SKILL.md` : un en-tête (`name`, `description`, `argument-hint`)
  et des instructions. Tu l'appelles avec `/<nom> <arguments>` ; `$ARGUMENTS` y est remplacé par ce que tu tapes.
- `disable-model-invocation: true` empêche l'agent de la lancer de lui-même : utile pour `/audit-lot` et
  `/livrer-lot`, qui doivent rester **ta** décision. `/verifier`, sans cette option, peut être lancée par l'agent.
- Avantage sur AGENTS.md : son contenu n'occupe le contexte **que** quand elle sert.

## 5. Permissions et hooks (`.claude/settings.json`)

| Liste | Effet | Exemples ici |
|---|---|---|
| `allow` | Exécuté sans te demander | Tests, typecheck, `git status` |
| `ask` | L'outil te demande à chaque fois | `git commit`, `git push`, migrations, `npm install` |
| `deny` | Refusé, même si l'agent ou toi le demandez | `db:reset`, `migrate reset`, `docker compose down -v`, `rm -rf`, lecture de `.env` |

Hook `PostToolUse` : après chaque `Edit` ou `Write`, `tsc --noEmit` s'exécute ; en cas d'erreur, l'agent reçoit
les erreurs et les corrige aussitôt. À activer **après ARCH-01** (avant, il n'y a pas de `tsconfig.json`) ;
s'il devient trop lent, le remplacer par un hook `Stop` (une fois par réponse).

## 6. Adapter ce dossier à un autre projet

1. `docs/rules.md` → les **règles métier chiffrées** du nouveau domaine, avec des exemples calculés : c'est
   le document qui évite le plus d'erreurs de l'IA.
2. `docs/architecture.md` → un seul exemple complet, traversant toutes les couches ; le premier ticket le produit
   réellement et tu le valides.
3. `Backlog.md` → un parcours de démonstration, des lots d'une journée, 4 à 7 tickets par lot, 3 à 5 critères
   par ticket, et un champ « Règles » qui renvoie à `rules.md`.
4. `AGENTS.md` → garder la structure ; changer stack, couches et sécurité.
5. `.claude/` → garder les trois skills et l'agent relecteur ; adapter les commandes de `settings.json`.

Viser : **moins de 600 lignes** de Markdown lues régulièrement par l'agent.
