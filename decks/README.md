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
    derivees.json
    trigonometrie.json
  francais/
    orthographe.json
  histoire/
    dates-xxe-siecle.json
```

Les fichiers `.json` posés directement à la racine de `decks/` restent acceptés
(rétro-compatibilité) et sont rangés dans la matière « Divers ».

## Mathématiques du collège

Le catalogue 2026-2027 contient **38 decks et 373 cartes** : 85 en 6e,
92 en 5e, 97 en 4e et 99 en 3e. Les titres commencent par la classe.
Chaque carte demande une formule, une définition, une propriété ou une méthode
générale. Les réponses sont courtes, sans problème chiffré à résoudre.
Consulter le [guide des contenus, sources et prérequis](../docs/college-2026-2027.md)
et le [graphe de progression](../curriculum/college-2026-2027.json).

Les champs éditoriaux `grade`, `school_year`, `curriculum_reference` et
`cards[].kind` sont conservés dans les fichiers, mais ignorés par le synchroniseur
actuel. L'arbre est documenté ; il n'est pas encore affiché dans l'application.

Vérifier le catalogue avec `python3 scripts/validate_college_decks.py`.

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
