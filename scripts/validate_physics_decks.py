#!/usr/bin/env python3
"""Valide les decks de formules de physique et leur curriculum."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DECK_DIR = ROOT / "decks" / "physique"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_text(value, location):
    require(isinstance(value, str) and value.strip(), f"{location}: texte vide")
    require(value.count("$") % 2 == 0, f"{location}: délimiteurs mathématiques incomplets")
    require(not any(ord(char) < 32 and char not in "\n\t" for char in value),
            f"{location}: caractère de contrôle")
    for formula in re.findall(r"\$([^$]+)\$", value):
        depth = 0
        for char in formula:
            depth += (char == "{") - (char == "}")
            require(depth >= 0, f"{location}: accolades déséquilibrées")
        require(depth == 0, f"{location}: accolades déséquilibrées")


def main():
    curriculum = json.loads((ROOT / "curriculum" / "physique.json").read_text())
    require(curriculum["schema_version"] == 2, "Version de schéma inconnue")
    require(curriculum["subject"] == "Physique", "Matière incorrecte")
    require(curriculum["school_year"] == "2026-2027", "Année scolaire incorrecte")

    sources = {source["id"] for source in curriculum["sources"]}
    nodes = {node["id"]: node for node in curriculum["nodes"]}
    require(len(nodes) == len(curriculum["nodes"]), "Nœud dupliqué")
    require(set(curriculum["grade_order"]) == set(curriculum["grade_labels"]),
            "Libellés de niveau incomplets")

    files = {path.stem: path for path in DECK_DIR.glob("*.json") if not path.name.startswith("_")}
    expected_files = {node_id.removeprefix("physique-") for node_id in nodes}
    require(set(files) == expected_files, "Les fichiers et le curriculum ne correspondent pas")

    total = 0
    for node_id, node in nodes.items():
        require(node["deck_id"] == node_id and SLUG.fullmatch(node_id), f"{node_id}: ID incorrect")
        require(node["source_id"] in sources, f"{node_id}: source inconnue")
        require(len(node["prerequisites"]) == len(set(node["prerequisites"])),
                f"{node_id}: prérequis dupliqué")
        for prerequisite in node["prerequisites"]:
            require(prerequisite in nodes, f"{node_id}: prérequis inconnu {prerequisite}")

        deck = json.loads(files[node_id.removeprefix("physique-")].read_text())
        require(deck["id"] == node_id, f"{node_id}: identité incohérente")
        require(deck["subject"] == curriculum["subject"], f"{node_id}: matière incohérente")
        require(deck["grade"] == node["grade"], f"{node_id}: niveau incohérent")
        require(deck["format"] == "math", f"{node_id}: format incorrect")
        require(deck["school_year"] == curriculum["school_year"], f"{node_id}: année incohérente")
        require(deck["curriculum_reference"] == node["source_id"], f"{node_id}: source incohérente")
        require(len(deck["cards"]) == node["card_count"], f"{node_id}: nombre de cartes incohérent")

        card_ids = set()
        fronts = set()
        for card in deck["cards"]:
            location = f"{node_id}:{card.get('id', '?')}"
            require(card.get("kind") == "formule", f"{location}: seule une formule est autorisée")
            require(SLUG.fullmatch(card.get("id", "")) and card["id"] not in card_ids,
                    f"{location}: ID invalide ou dupliqué")
            require(card["front"] not in fronts, f"{location}: question dupliquée")
            card_ids.add(card["id"])
            fronts.add(card["front"])
            validate_text(card["front"], f"{location}:front")
            validate_text(card["back"], f"{location}:back")
        total += len(deck["cards"])

    visiting = set()
    visited = set()

    def visit(node_id):
        require(node_id not in visiting, f"Cycle dans les prérequis : {node_id}")
        if node_id in visited:
            return
        visiting.add(node_id)
        for prerequisite in nodes[node_id]["prerequisites"]:
            visit(prerequisite)
        visiting.remove(node_id)
        visited.add(node_id)

    for node_id in nodes:
        visit(node_id)
    print(f"OK : {len(nodes)} decks, {total} formules, graphe sans cycle.")


if __name__ == "__main__":
    main()
