#!/usr/bin/env python3
"""Valide le catalogue d'anglais et les paires vocabulaire/écoute."""

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DECKS = ROOT / "decks" / "anglais"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
EXPECTED_DECKS = {"6e": 14, "5e": 10, "4e": 10, "3e": 10, "2de": 10, "1re": 10, "Terminale": 10}
CATEGORIES = {"vocabulary", "listening", "culture", "irregular-verbs", "grammar"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    paths = sorted(DECKS.glob("*.json"))
    require(len(paths) == sum(EXPECTED_DECKS.values()), "Nombre total de decks incorrect")
    decks = {}
    counts = Counter()
    global_ids = set()

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
        require(len(deck.get("cards", [])) == 10, f"{path.name}: dix cartes attendues")

        card_ids = set()
        for card in deck["cards"]:
            card_id = card.get("id")
            require(isinstance(card_id, str) and SLUG.fullmatch(card_id), f"{path.name}: ID de carte invalide")
            require(card_id not in card_ids, f"{path.name}: ID de carte dupliqué")
            card_ids.add(card_id)
            require(isinstance(card.get("front"), str) and card["front"].strip(), f"{path.name}:{card_id}: recto vide")
            require(isinstance(card.get("back"), str) and card["back"].strip(), f"{path.name}:{card_id}: verso vide")

        decks[path.stem] = deck
        counts[deck["grade"]] += 1

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

    require(listening == 23, "23 listes de compréhension orale attendues")
    print(f"OK : {len(paths)} decks, {len(paths) * 10} cartes, {listening} paires vocabulaire/oral.")
    for grade in EXPECTED_DECKS:
        print(f"  {grade} : {counts[grade]} decks, {counts[grade] * 10} cartes")


if __name__ == "__main__":
    main()
