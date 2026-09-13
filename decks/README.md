# Decks

Ce dossier stocke les paquets de cartes synchronisés par l'application.
Chaque **sous-dossier est une matière** (ex. `maths/`, `francais/`, `histoire/`)
affichée sur l'écran d'accueil. Chaque fichier `.json` du sous-dossier devient
un paquet de cette matière, synchronisé à l'ouverture de l'app (ou en tirant la
liste vers le bas).

```
decks/
  maths/
    6e-nombres.json … 3e-trigonometrie.json   (catalogue collège)
  anglais/
    6e-vocab-salutations.json … term-grammaire-emphase-synthese.json
  francais/
    orthographe.json
  histoire/
    dates-xxe-siecle.json
```

Les fichiers `.json` posés directement à la racine de `decks/` restent acceptés
(rétro-compatibilité) et sont rangés dans la matière « Divers ».

Voir l’[arbre textuel de progression de la 6e à la terminale](../docs/progression-mathematiques-2026-2027.md),
qui regroupe tous les niveaux dans des branches thématiques communes.

## Mathématiques du collège

Le catalogue 2026-2027 contient **38 decks et 373 cartes** : 85 en 6e,
92 en 5e, 97 en 4e et 99 en 3e. Les titres commencent par la classe.
Chaque carte demande une formule, une définition, une propriété ou une méthode
générale. Les réponses sont courtes, sans problème chiffré à résoudre.
Consulter le [guide des contenus, sources et prérequis](../docs/college-2026-2027.md)
et le [graphe de progression](../curriculum/maths.json).

Le champ `grade` (ex. `"6e"`) est synchronisé et permet de filtrer les paquets
par classe dans l'application. Les champs `school_year`, `curriculum_reference`
et `cards[].kind` restent des champs éditoriaux conservés dans les fichiers mais
ignorés par le synchroniseur.

Vérifier le catalogue avec `python3 scripts/validate_college_decks.py`.

## Mathématiques du lycée

Le catalogue 2026-2027 ajoute **54 decks et 542 cartes** pour la 2de générale et
technologique, la 1re spécialité, la terminale spécialité et la terminale
mathématiques complémentaires. Même format de rappel : formules, définitions,
propriétés et méthodes générales, avec des réponses courtes.

Les fichiers commencent par `2de-`, `1re-spe-`, `term-spe-` ou
`term-complementaires-`. Chaque titre précise le parcours. Les prérequis forment
deux branches distinctes en terminale, sans verrouillage dans l’application.

Consulter le [guide du lycée et les sources officielles](../docs/lycee-2026-2027.md)
et le [graphe de progression](../curriculum/maths.json).
Vérifier avec `python3 scripts/validate_lycee_decks.py`.

## Anglais du collège au lycée

Le catalogue contient **161 decks et 1 725 cartes**, classés par niveau de la 6e
à la terminale : 56 listes de vocabulaire, leurs 56 copies en compréhension
orale, 14 listes de culture, 185 verbes irréguliers et 28 listes de grammaire. Les champs
éditoriaux `category`, `mode`, `audio_language`, `cards[].kind` et
`cards[].audio_text` sont conservés dans les fichiers mais actuellement ignorés
par le synchroniseur.

Consulter l'[arbre de progression en anglais](../docs/progression-anglais.md)
pour les parcours conseillés, les prérequis et les principes de conception.
Vérifier avec `python3 scripts/validate_english_decks.py`.

## Format

```json
{
  "id": "mon-paquet",              // unique, stable (sert de clé de synchronisation)
  "subject": "Maths",              // matière affichée (défaut : nom du dossier)
  "title": "Titre du paquet",
  "description": "Description courte (optionnel)",
  "format": "math",                // "math" (rendu LaTeX) ou "people" (défaut)
  "color": "#CBDDF5",              // couleur du paquet (optionnel)
  "daily_new_limit": 5,            // nouvelles cartes par jour (optionnel, 5 par défaut)
  "cards": [
    {
      "id": "id-carte",            // unique dans le paquet, stable
      "front": "Question — supporte du LaTeX entre $…$ ou $$…$$",
      "back": "Réponse — supporte aussi le LaTeX"
    }
  ]
}
```

## Matières

- Le nom du dossier donne la matière (`maths` → « Maths ») ; le champ
  `subject` du JSON permet de préciser le nom affiché (ex. `francais/` →
  « Français » avec l'accent).
- Créer un nouveau dossier = créer une nouvelle matière dans l'app.
- Dans l'app, chaque matière peut être masquée ou affichée depuis l'accueil
  (bouton en haut à droite de la section « Mes matières »).

## Rendu des formules

Avec `"format": "math"`, le LaTeX inline (`$x^n$`) et display (`$$\frac{a}{b}$$`)
est rendu avec KaTeX. Le texte hors délimiteurs reste tel quel.

## Synchronisation

- Ajouter / modifier / supprimer un fichier ici, puis pousser sur la branche par défaut.
- Les cartes sont identifiées par `id-paquet:id-carte` : garder les `id` stables
  préserve la progression (révisions) des cartes modifiées.
- Déplacer un paquet d'un dossier à l'autre change sa matière mais conserve sa
  progression (tant que son `id` ne change pas).
- Un paquet supprimé du dossier est retiré de l'app à la synchronisation suivante.
