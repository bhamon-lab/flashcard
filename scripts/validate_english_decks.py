#!/usr/bin/env python3
"""Valide le catalogue d'anglais et les paires vocabulaire/écoute."""

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DECKS = ROOT / "decks" / "anglais"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
EXPECTED_DECKS = {grade: 23 for grade in ("6e", "5e", "4e", "3e", "2de", "1re", "Terminale")}
EXPECTED_CARDS = {"6e": 240, "5e": 245, "4e": 245, "3e": 250, "2de": 248, "1re": 247, "Terminale": 250}
IRREGULAR_COUNTS = {"6e": 20, "5e": 25, "4e": 25, "3e": 30, "2de": 28, "1re": 27, "Terminale": 30}
CATEGORIES = {"vocabulary", "listening", "culture", "irregular-verbs", "grammar"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    paths = sorted(DECKS.glob("*.json"))
    require(len(paths) == sum(EXPECTED_DECKS.values()), "Nombre total de decks incorrect")
    decks = {}
    counts = Counter()
    card_counts = Counter()
    category_counts = Counter()
    global_ids = set()
    irregular_ids = set()

    for path in paths:
        deck = json.loads(path.read_text(encoding="utf-8"))
        deck_id = deck.get("id")
        require(isinstance(deck_id, str) and SLUG.fullmatch(deck_id), f"{path.name}: ID invalide")
        require(deck_id not in global_ids, f"{path.name}: ID de deck dupliqué")
        global_ids.add(deck_id)
        require(deck.get("subject") == "Anglais", f"{path.name}: matière incorrecte")
        require(deck.get("grade") in EXPECTED_DECKS, f"{path.name}: niveau incorrect")
        require(deck.get("category") in CATEGORIES, f"{path.name}: catégorie incorrecte")
        require(deck.get("format") == "people", f"{path.name}: format incorrect")
        expected_cards = IRREGULAR_COUNTS[deck["grade"]] if deck["category"] == "irregular-verbs" else 10
        require(len(deck.get("cards", [])) == expected_cards,
                f"{path.name}: {expected_cards} cartes attendues")

        card_ids = set()
        for card in deck["cards"]:
            card_id = card.get("id")
            require(isinstance(card_id, str) and SLUG.fullmatch(card_id), f"{path.name}: ID de carte invalide")
            require(card_id not in card_ids, f"{path.name}: ID de carte dupliqué")
            card_ids.add(card_id)
            require(isinstance(card.get("front"), str) and card["front"].strip(), f"{path.name}:{card_id}: recto vide")
            require(isinstance(card.get("back"), str) and card["back"].strip(), f"{path.name}:{card_id}: verso vide")
            if deck["category"] == "irregular-verbs":
                require(card_id not in irregular_ids, f"Verbe irrégulier répété entre les niveaux : {card_id}")
                irregular_ids.add(card_id)

        decks[path.stem] = deck
        counts[deck["grade"]] += 1
        card_counts[deck["grade"]] += len(deck["cards"])
        category_counts[deck["category"]] += 1

    require(dict(counts) == EXPECTED_DECKS, f"Répartition par niveau incorrecte : {dict(counts)}")

    listening = 0
    for stem, oral in decks.items():
        if oral["category"] != "listening":
            continue
        listening += 1
        vocab_stem = stem.replace("-oral-", "-vocab-", 1)
        require(vocab_stem in decks, f"{stem}: liste de vocabulaire source absente")
        vocab = decks[vocab_stem]
        require(oral.get("mode") == "listening", f"{stem}: mode audio absent")
        require(oral.get("audio_language") == "en-GB", f"{stem}: langue audio incorrecte")
        require([card["id"] for card in oral["cards"]] == [card["id"] for card in vocab["cards"]],
                f"{stem}: les identifiants ne correspondent pas à la liste écrite")
        require([card.get("audio_text") for card in oral["cards"]] == [card["back"] for card in vocab["cards"]],
                f"{stem}: le contenu audio ne correspond pas à la liste écrite")

    require(listening == 56, "56 listes de compréhension orale attendues")
    require(dict(category_counts) == {
        "vocabulary": 56,
        "listening": 56,
        "culture": 14,
        "irregular-verbs": 7,
        "grammar": 28,
    }, f"Répartition par catégorie incorrecte : {dict(category_counts)}")
    total_cards = sum(card_counts.values())
    require(len(irregular_ids) == 185, f"185 verbes irréguliers attendus, {len(irregular_ids)} trouvés")
    require(dict(card_counts) == EXPECTED_CARDS, f"Répartition des cartes incorrecte : {dict(card_counts)}")
    require(total_cards == 1725, f"1725 cartes attendues, {total_cards} trouvées")
    print(f"OK : {len(paths)} decks, {total_cards} cartes, {listening} paires vocabulaire/oral.")
    for grade in EXPECTED_DECKS:
        print(f"  {grade} : {counts[grade]} decks, {card_counts[grade]} cartes")


if __name__ == "__main__":
    main()
