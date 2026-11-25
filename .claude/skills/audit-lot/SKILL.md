---
name: audit-lot
description: Phase 1 d'un lot du backlog — analyse des tickets et synthèse des décisions à valider, sans rien modifier. À utiliser quand l'utilisateur demande l'audit d'un lot (L1 à L4).
argument-hint: "<lot, ex. L2>"
disable-model-invocation: true
---

# Audit du lot $ARGUMENTS

Phase 1 de la méthode (`AGENTS.md` §7). **Ne modifier aucun fichier, n'installer aucune dépendance, ne lancer
aucune migration.** Seule exception : créer `docs/lots/$ARGUMENTS.md` à partir de `docs/lots/_modele.md`
une fois les décisions validées.

## Étapes

1. **État réel** : `git status`, `git log --oneline -5`, synchronisation avec `origin/main`. Signaler tout écart.
2. **Tickets** : lire dans `Backlog.md` les tickets du lot $ARGUMENTS, leurs dépendances (sont-elles ✅ ?) et
   les paragraphes de `docs/rules.md` qu'ils citent.
3. **Code existant** : pour un lot qui touche beaucoup de fichiers, déléguer la lecture à un sous-agent `Explore`
   avec une question précise (ex. « quels ports, agrégats et repositories existent déjà pour le contexte combat ? »),
   et ne garder que sa conclusion.
4. **Écarts** : toute règle manquante dans `rules.md`, tout critère impossible ou contradictoire, devient une décision D.
   Ne jamais inventer de règle de jeu.

## Format de la réponse (une page au plus)

| Ticket | Objectif | Fichiers (créés / modifiés) | Base | Tests clés |
|---|---|---|---|---|

Puis :
- **Ordre de réalisation** et justification en une ligne.
- **Risques** (3 au plus) avec leur parade.
- **Décisions D1, D2…** : tableau « question / recommandation / alternative ».
- **Adaptations E1, E2…** : écarts au backlog proposés.

Terminer en demandant la validation des décisions. Ne pas commencer la réalisation.
