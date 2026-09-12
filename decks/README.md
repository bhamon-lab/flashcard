# Decks

Ce dossier stocke les paquets de cartes synchronisés par l'application.
Chaque fichier `.json` devient un paquet disponible sur l'écran d'accueil,
synchronisé à l'ouverture de l'app (ou en tirant la liste vers le bas).

## Mathématiques du collège

Le catalogue 2026-2027 contient **38 decks et 600 cartes** : 138 en 6e,
150 en 5e, 154 en 4e et 158 en 3e. Les titres commencent par la classe.
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

## Rendu des formules

Avec `"format": "math"`, le LaTeX inline (`$x^n$`) et display (`$$\frac{a}{b}$$`)
est rendu avec KaTeX. Le texte hors délimiteurs reste tel quel.

## Synchronisation

- Ajouter / modifier / supprimer un fichier ici, puis pousser sur la branche par défaut.
- Les cartes sont identifiées par `id-paquet:id-carte` : garder les `id` stables
  préserve la progression (révisions) des cartes modifiées.
- Un paquet supprimé du dossier est retiré de l'app à la synchronisation suivante.
