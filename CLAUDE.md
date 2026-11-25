# CLAUDE.md

@AGENTS.md

## Spécifique à Claude Code

- Répondre en français, de façon concise : tableaux courts, aucune répétition d'une règle déjà écrite dans AGENTS.md.
- Une session par lot ; `/clear` ou nouvelle session entre deux lots. Tout l'état est dans `Backlog.md` et Git.
- Phase 1 en mode Plan, avec la skill `/audit-lot`.
- Sous-agents :
  - `Explore` pour parcourir le code pendant un audit, quand il faut lire beaucoup de fichiers ;
  - `relecteur` (`.claude/agents/relecteur.md`) après chaque réalisation, avant `/livrer-lot` ;
  - jamais pour implémenter les tickets d'un lot : ils partagent des fichiers et des décisions.

## Environnement local

- Windows 11 : Git Bash et PowerShell disponibles.
- Scripts de plus d'une ligne : fichier écrit avec l'outil Write, jamais de heredoc shell.
- Docker Desktop doit être démarré avant `npm run db:up`.
- Tout script qui utilise la base de test exige `NODE_ENV=test`.
