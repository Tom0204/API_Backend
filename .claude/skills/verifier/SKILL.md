---
name: verifier
description: Vérification complète avant de déclarer un lot terminé — typecheck, tests sans base et en ordre aléatoire, tests PostgreSQL, build, test manuel du serveur compilé. À utiliser à la fin de chaque réalisation, ou quand l'utilisateur demande de tout vérifier.
---

# Vérification complète

Exécuter **réellement** chaque étape, dans cet ordre, et rapporter le résultat exact. Une étape impossible
(Docker arrêté…) est signalée comme non vérifiée, jamais comme réussie.

| # | Commande | Attendu |
|---|---|---|
| 1 | `npm run typecheck` | Aucune erreur |
| 2 | `npm test` | Tout passe ; noter le nombre de tests |
| 3 | `npx vitest run --sequence.shuffle` | Tout passe (détecte les tests dépendants de l'ordre) |
| 4 | `npm run db:status` puis `npm run test:db` | Aucune migration en attente ; tout passe |
| 5 | `npm run build` | Build réussi |
| 6 | Test manuel | Voir ci-dessous |

## Test manuel du serveur compilé

1. Démarrer `dist/server.cjs` en arrière-plan, sur le port 3999, avec `DATABASE_URL` = la valeur de
   `TEST_DATABASE_URL` (vérifier que la base est `mmorpg_test` ; ne jamais afficher l'URL).
2. Rejouer avec `curl` le parcours des tickets du lot : cas nominal, ressource d'un autre joueur, 400, 401.
   Comptes `*.<lot>@example.com`.
3. Arrêter **uniquement** le serveur lancé à l'étape 1.
4. Supprimer les comptes créés à l'étape 2 dans `mmorpg_test`, après avoir vérifié `current_database()`.
5. Vérifier que les logs du serveur ne contiennent ni mot de passe, ni jeton, ni URL de connexion.

## Rapport

Tableau « vérification / résultat » (avec les nombres de tests), puis la liste des problèmes trouvés.
En cas d'échec : corriger, puis relancer **toutes** les étapes concernées.
