---
name: livrer-lot
description: Phase 3 d'un lot — mise à jour des statuts, contrôle du diff, commit puis push sur autorisation. À utiliser uniquement quand l'utilisateur a validé le bilan du lot et demande la livraison.
argument-hint: "<lot, ex. L2>"
disable-model-invocation: true
---

# Livraison du lot $ARGUMENTS

Ne modifier **aucun contenu fonctionnel** pendant cette étape. Si un problème réel apparaît : s'arrêter et le présenter.

## Étapes

1. **Statuts** : dans `Backlog.md`, passer les tickets du lot à ✅ et compléter la ligne du lot (statut).
   Compléter `docs/lots/$ARGUMENTS.md` (vérifications, points restants).
2. **Contrôle** :
   - `git status --short --untracked-files=all` : seuls des fichiers du périmètre du lot ;
   - aucun fichier temporaire, `.env`, secret, `dist/` ou `node_modules/` ;
   - `git diff` relu : aucune URL de connexion, aucun mot de passe, aucune trace de débogage.
3. **Commit** : un seul commit, Conventional Commits en français avec les tickets, par exemple
   `feat: personnages et progression (CHAR-01 à CHAR-04)`. Corps : 3 à 6 puces.
4. **Push** sur `origin/main` (l'outil demande une confirmation).
5. **Commit dans le backlog** : reporter le hash court dans la colonne « Commit » de la ligne du lot au début du
   lot suivant (le hash n'existe qu'après le commit).
6. **État final** : `git fetch`, puis `HEAD` = `origin/main` et arbre de travail propre.

## Rapport

Hash du commit, résultat du push, état final du dépôt.
