# Règles de jeu du MVP

Toute valeur de ce document est un **paramètre** : le code la lit depuis un emplacement unique
(`src/domain/shared/game-rules.ts` ou données de référence du seed), jamais répétée. Une règle absente d'ici
n'existe pas : aucun agent ne l'invente, elle passe par la section 11.
Chaque exemple chiffré de ce document est un test automatisé obligatoire.

## 1. Périmètre du MVP

Parcours jouable, entièrement réalisable avec Postman :
inscription → connexion → choix d'une classe → création d'un personnage → statistiques → monstres de la zone
→ combat → victoire (XP, niveau, butin) ou défaite → état mis à jour.

**Hors MVP :** compétences et mana utilisé, critiques, fuite, déplacements entre zones, réapparition des monstres,
régénération, équipement, monnaie, quêtes, groupes, guildes, PvP, temps réel.

## 2. Principes

- Le serveur calcule tout. Le combat est **déterministe** ; seul le butin est aléatoire, avec un générateur injectable pour les tests.
- Tous les nombres sont entiers : dégâts arrondis à l'entier inférieur, XP à l'entier le plus proche.

## 3. Classes et statistiques

| Statistique | Rôle |
|---|---|
| PV | Points de vie maximum ; à 0, le participant est vaincu |
| Mana | Ressource des compétences ; inutilisée au MVP |
| Attaque | Puissance de l'attaque de base |
| Défense | Réduit les dégâts reçus |
| Vitesse | Ordre de jeu |

| Classe | PV | Mana | Attaque | Défense | Vitesse |
|---|---|---|---|---|---|
| Guerrier, niveau 1 | 120 | 20 | 12 | 8 | 8 |
| Guerrier, gain par niveau | +12 | +2 | +2 | +2 | +1 |
| Mage, niveau 1 | 80 | 100 | 10 | 4 | 10 |
| Mage, gain par niveau | +8 | +10 | +2 | +1 | +1 |
| Voleur, niveau 1 | 95 | 40 | 11 | 6 | 14 |
| Voleur, gain par niveau | +10 | +4 | +2 | +1 | +2 |

- `stat(niveau) = base + gain × (niveau − 1)`. Exemple : guerrier niveau 5 → **168 PV**, **20 d'attaque**.
- Les statistiques ne sont **jamais stockées** : elles se calculent à partir de la classe et du niveau.
- PV et mana courants = maximum actuel (remis au maximum après chaque combat, aucune régénération).
- Pas de bonus d'équipement ni de critique au MVP.

## 4. Personnages

- 5 personnages au maximum par compte ; la limite tient même en cas de créations simultanées.
- Nom : 3 à 16 lettres `A–Z` / `a–z` (sans accent, espace ni chiffre), unique sans tenir compte de la casse.
- À la création : niveau 1, XP 0, zone de départ. Le client fournit uniquement `name` et `classId`.

## 5. Expérience et niveaux

- Niveau maximal : **10**. XP pour passer du niveau n à n + 1 : `xpRequise(n) = arrondi(100 × n^1,5)`.
- Le personnage stocke son niveau et l'XP acquise **dans son niveau courant**.

| n | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| XP pour n → n + 1 | 100 | 283 | 520 | 800 | 1 118 | 1 470 | 1 852 | 2 263 | 2 700 |
| XP cumulée | 100 | 383 | 903 | 1 703 | 2 821 | 4 291 | 6 143 | 8 406 | 11 106 |

- Un gain peut faire passer plusieurs niveaux. Exemple : niveau 1 avec 90 XP, + 300 XP → **niveau 3 avec 7 XP**.
- Au niveau 10, tout gain est ignoré et l'XP vaut 0. Un gain qui fait atteindre le niveau 10 perd son reste.
- Le gain est toujours un entier ≥ 1 attribué par le serveur ; aucune route ne modifie le niveau ou l'XP.
- Les attributions simultanées ne perdent aucun gain.

## 6. Combat

- 1 personnage contre 1 monstre, tour par tour ; un seul combat `IN_PROGRESS` par personnage.
- Le combat fige les statistiques des deux participants ; chacun commence avec ses PV au maximum.
- Chaque combat crée **sa propre instance** du monstre à partir du modèle.
- **Initiative :** le plus rapide commence ; égalité → le personnage. Puis alternance stricte.
- **Joueur :** uniquement `ATTACK` sur le monstre. **Monstre :** attaque de base, résolue par le serveur dans la même requête.
- **Dégâts :** `max(1, arrondi_inférieur(attaque × 100 / (100 + défense)))`. Les PV sont bornés à 0.

| Attaquant | Défenseur | Dégâts |
|---|---|---|
| Guerrier niv. 1 (attaque 12) | Loup (défense 2) | 11 |
| Loup (attaque 8) | Guerrier niv. 1 (défense 8) | 7 |
| Guerrier niv. 5 (attaque 20) | Bandit (défense 6) | 18 |
| Attaque 1 | Défense 200 | 1 (minimum) |

## 7. Fin de combat et récompenses

- États : `IN_PROGRESS` → `VICTORY` ou `DEFEAT`, terminaux (toute action suivante : 422 `COMBAT_FINISHED`).
- **Victoire :** XP fixe du monstre et butin éventuel, attribués **une seule fois**, dans une transaction.
- **Défaite :** ni XP, ni butin, ni pénalité.
- Butin : au plus un objet, quantité 1 ; tirage r uniforme dans [0, 1[ ; obtenu si r < p.
- Pas de monnaie au MVP.

## 8. Monde initial (seed)

Zone de départ : **Clairière** (`clearing`), niveaux 1 à 3.

| Monstre | Niveau | PV | Attaque | Défense | Vitesse | XP | Butin (p) |
|---|---|---|---|---|---|---|---|
| Loup | 1 | 40 | 8 | 2 | 9 | 25 | Peau de loup (0,5) |
| Sanglier | 2 | 60 | 10 | 5 | 6 | 40 | Défense de sanglier (0,4) |
| Bandit | 3 | 75 | 12 | 6 | 11 | 60 | Insigne de bandit (0,25) |

Exemple de référence : guerrier niv. 1 (120 PV, vitesse 8) contre loup (40 PV, vitesse 9). Le loup commence ;
après 4 actions du guerrier, `VICTORY` avec 92 PV restants (120 après le combat) et 25 XP.

## 9. Paramètres

| Paramètre | Valeur |
|---|---|
| Niveau maximal | 10 |
| Personnages par compte | 5 |
| Longueur du nom | 3 à 16 |
| Courbe d'XP | base 100, exposant 1,5 |
| Constante de défense / dégâts minimum | 100 / 1 |

## 10. Inventaire

- Un inventaire par personnage, créé vide avec lui.
- Les objets d'un même type s'empilent (quantité) ; **aucune limite de capacité ni de pile** dans ce projet.
- Les objets du butin sont des matériaux sans effet.

## 11. À décider (aucun ticket ne s'appuie dessus)

Bonus d'équipement, critique, fuite, régénération : hors projet. Si un ticket en a besoin, la règle est ajoutée ici
avant son audit.
