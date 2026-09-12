# Decks

Ce dossier stocke les paquets de cartes synchronisés par l'application.
Chaque fichier `.json` devient un paquet disponible sur l'écran d'accueil,
synchronisé à l'ouverture de l'app (ou en tirant la liste vers le bas).

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
