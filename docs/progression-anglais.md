# Arbre de progression en anglais — de la 6e à la terminale

Le catalogue contient **74 decks et 855 cartes**, organisés par classe et par
type d'apprentissage. La classe est un parcours conseillé, pas un verrou : un
élève peut reprendre une liste antérieure ou avancer dans une branche précise.

Chaque liste de vocabulaire existe deux fois :

1. **Vocabulaire** : le français est affiché, l'élève produit le mot ou le groupe
   de mots anglais.
2. **Compréhension orale** : le même contenu anglais est fourni dans
   `cards[].audio_text` et l'élève donne le sens français.

Les champs `mode: "listening"`, `audio_language: "en-GB"` et `audio_text` sont
déjà présents dans les JSON. Ils sont éditoriaux tant que l'application ne prend
pas encore en charge l'audio.

## Vue par niveau

```text
Anglais — 6e à Terminale
├── 6e · Fondations (A1)
│   ├── Vocabulaire + compréhension orale
│   │   ├── Salutations et politesse
│   │   ├── Couleurs
│   │   ├── Pièces de la maison
│   │   ├── Famille
│   │   └── École et classe
│   ├── Culture · Pays anglophones et capitales
│   ├── Verbes irréguliers · série 1
│   └── Grammaire
│       ├── Be, have got et pronoms
│       └── Présent simple et questions
├── 5e · Quotidien (A1–A2)
│   ├── Vocabulaire + compréhension orale
│   │   ├── Routine quotidienne
│   │   ├── Ville et directions
│   │   └── Loisirs et sports
│   ├── Culture · Royaume-Uni : repères et fêtes
│   ├── Verbes irréguliers · série 2
│   └── Grammaire
│       ├── Présent continu et fréquence
│       └── Comparatifs et quantités
├── 4e · Récit et déplacement (A2)
│   ├── Vocabulaire + compréhension orale
│   │   ├── Voyage et transports
│   │   ├── Corps et santé
│   │   └── Météo et environnement
│   ├── Culture · Irlande, Canada, Australie et Nouvelle-Zélande
│   ├── Verbes irréguliers · série 3
│   └── Grammaire
│       ├── Prétérit simple
│       └── Récit, futur et modaux
├── 3e · Médias et citoyenneté (A2–B1)
│   ├── Vocabulaire + compréhension orale
│   │   ├── Médias et numérique
│   │   ├── Société et citoyenneté
│   │   └── Émotions et relations
│   ├── Culture · Figures historiques et droits civiques
│   ├── Verbes irréguliers · série 4
│   └── Grammaire
│       ├── Present perfect
│       └── Conditionnels et obligation
├── 2de · Identités et représentations (B1)
│   ├── Vocabulaire + compréhension orale
│   │   ├── Identité et relations
│   │   ├── Environnement et solutions
│   │   └── Arts et pouvoir
│   ├── Culture · Institutions américaines et britanniques
│   ├── Verbes irréguliers · série 5
│   └── Grammaire
│       ├── Temps du récit
│       └── Relatives, passif et modaux
├── 1re · Analyse et mémoire (B1–B2)
│   ├── Vocabulaire + compréhension orale
│   │   ├── Analyse des médias
│   │   ├── Innovation et éthique
│   │   └── Migration et mémoire
│   ├── Culture · Littérature, arts et figures anglophones
│   ├── Verbes irréguliers · série 6
│   └── Grammaire
│       ├── Passif et discours indirect
│       └── Hypothèses et nuances
└── Terminale · Débat et synthèse (B2)
    ├── Vocabulaire + compréhension orale
    │   ├── Débat et argumentation
    │   ├── Politique et société
    │   └── Enjeux mondiaux et technologie
    ├── Culture · Commonwealth et institutions contemporaines
    ├── Verbes irréguliers · série 7
    └── Grammaire
        ├── Conditionnels avancés
        └── Emphase et synthèse
```

## Arbre transversal des prérequis

Les quatre branches progressent indépendamment. Un élève peut donc travailler
la culture de son niveau tout en reprenant la grammaire ou le vocabulaire d'une
classe précédente.

```text
Vocabulaire écrit
6e Fondations
└── 5e Quotidien
    └── 4e Voyage, santé et environnement
        └── 3e Médias, citoyenneté et relations
            └── 2de Identité, environnement et arts
                └── 1re Médias, éthique et mémoire
                    └── Terminale Débat, société et enjeux mondiaux

Compréhension orale
Chaque liste de vocabulaire écrit
└── sa copie orale portant exactement sur les mêmes dix entrées
    └── les listes orales du niveau suivant

Culture
6e Pays et capitales
└── 5e Royaume-Uni et fêtes
    └── 4e Diversité du monde anglophone
        └── 3e Figures historiques et droits civiques
            └── 2de Institutions britanniques et américaines
                └── 1re Littérature et arts
                    └── Terminale Commonwealth et institutions contemporaines

Verbes irréguliers — 185 verbes distincts
Série 1 (6e, 20 verbes) → série 2 (5e, 25) → série 3 (4e, 25)
→ série 4 (3e, 30) → série 5 (2de, 28) → série 6 (1re, 27)
→ série 7 (Terminale, 30)

Grammaire
Be / have got / pronoms
└── Présent simple et questions
    └── Présent continu, fréquence, comparaison et quantité
        └── Prétérit, temps du récit, futur et modaux
            └── Present perfect, conditionnels et obligation
                └── Temps du récit, relatives et passif
                    └── Discours indirect, hypothèses et nuances
                        └── Conditionnels avancés, emphase et synthèse
```

## Organisation des fichiers

Les noms sont prévisibles afin de faciliter les ajouts et la future interface :

- `{niveau}-vocab-{theme}.json` : production français → anglais ;
- `{niveau}-oral-{theme}.json` : écoute anglais → sens français ;
- `{niveau}-culture.json` : repères du monde anglophone ;
- `{niveau}-verbes-irreguliers.json` : infinitif, prétérit et participe passé ;
- `{niveau}-grammaire-{theme}.json` : règles et automatismes.

Les paquets de vocabulaire, d'écoute, de culture et de grammaire contiennent dix
cartes. Les séries de verbes irréguliers contiennent entre vingt et trente
nouveaux verbes par niveau. Le parcours complet couvre **185 verbes distincts**,
sans répéter les verbes entre les séries ; les variantes britanniques et
américaines usuelles sont indiquées ensemble.

Les listes de vocabulaire et leurs copies orales partagent les mêmes identifiants
de cartes à l'intérieur de deux decks distincts, ce qui permet de vérifier
automatiquement qu'aucune entrée ne manque d'un côté.

## Maintenance

Le catalogue est généré depuis
[`scripts/generate_english_decks.py`](../scripts/generate_english_decks.py).
Après une modification des listes sources, exécuter :

```sh
python3 scripts/generate_english_decks.py
```

Le générateur refuse de terminer s'il détecte dans `decks/anglais/` un JSON qui
n'appartient pas à son catalogue, afin qu'un ancien deck ne reste pas publié par
erreur.
