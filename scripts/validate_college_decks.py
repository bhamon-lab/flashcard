#!/usr/bin/env python3
"""Validate college content and its prerequisite graph, using only the stdlib."""

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
GRADES = {"6e", "5e", "4e", "3e"}
KINDS = {"formule", "definition", "propriete", "methode"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_text(value, location):
    require(isinstance(value, str) and value.strip(), f"{location}: texte vide")
    require(not any(ord(c) < 32 and c not in "\n\t" for c in value),
            f"{location}: caractère de contrôle (échappement LaTeX incorrect ?)")
    require(value.count("$") % 2 == 0, f"{location}: délimiteurs mathématiques incomplets")
    require(not any(marker in value.lower() for marker in ("todo", "à compléter", "lorem ipsum")),
            f"{location}: contenu provisoire")
    for formula in re.findall(r"\$([^$]+)\$", value):
        depth = 0
        for char in formula:
            depth += (char == "{") - (char == "}")
            require(depth >= 0, f"{location}: accolades déséquilibrées")
        require(depth == 0, f"{location}: accolades déséquilibrées")


def main():
    manifest = json.loads((ROOT / "curriculum/college-2026-2027.json").read_text())
    require(manifest["schema_version"] == 1, "Version de schéma inconnue")
    require(manifest["school_year"] == "2026-2027", "Année scolaire incorrecte")
    sources = {s["id"]: s for s in manifest["sources"]}
    require(len(sources) == len(manifest["sources"]), "Source dupliquée")
    for source in sources.values():
        require(source["url"].startswith(("https://www.education.gouv.fr/",
                                          "https://eduscol.education.gouv.fr/")),
                f"{source['id']}: source officielle manquante")

    nodes = {n["id"]: n for n in manifest["nodes"]}
    require(len(nodes) == len(manifest["nodes"]), "Nœud dupliqué")
    require({n["grade"] for n in nodes.values()} == GRADES, "Classe manquante")
    deck_ids = set()
    # Check global ID collisions, including the pre-existing non-college decks.
    for path in (ROOT / "decks").glob("*/*.json"):
        deck = json.loads(path.read_text())
        require(deck["id"] not in deck_ids, f"ID de deck dupliqué : {deck['id']}")
        deck_ids.add(deck["id"])

    catalog_files = {p.stem for p in (ROOT / "decks" / "maths").glob("[3456]e-*.json")}
    require(catalog_files == {node_id.removeprefix("math-") for node_id in nodes},
            "Les fichiers et le catalogue ne correspondent pas")
    stats = Counter()
    for node_id, node in nodes.items():
        require(node["deck_id"] == node_id and SLUG.fullmatch(node_id), f"ID incorrect : {node_id}")
        require(node["source_id"] in sources, f"{node_id}: source absente")
        validate_text(node["source_section"], f"{node_id}: référence au programme")
        require(len(node["prerequisites"]) == len(set(node["prerequisites"])),
                f"{node_id}: prérequis dupliqué")
        for parent in node["prerequisites"]:
            require(parent in nodes, f"{node_id}: prérequis inconnu {parent}")
            require(int(nodes[parent]["grade"][0]) >= int(node["grade"][0]),
                    f"{node_id}: prérequis d'une classe ultérieure")
        deck = json.loads((ROOT / "decks" / "maths" / f"{node_id.removeprefix('math-')}.json").read_text())
        require(deck["id"] == node_id and deck["grade"] == node["grade"], f"{node_id}: identité incohérente")
        require(deck["format"] == "math", f"{node_id}: format incorrect")
        require(deck["school_year"] == manifest["school_year"], f"{node_id}: année incohérente")
        require(deck["curriculum_reference"] == node["source_id"], f"{node_id}: source incohérente")
        require(re.fullmatch(r"#[0-9a-fA-F]{6}", deck["color"]), f"{node_id}: couleur invalide")
        require(isinstance(deck["daily_new_limit"], int) and deck["daily_new_limit"] > 0,
                f"{node_id}: limite quotidienne incorrecte")
        require(len(deck["cards"]) == node["card_count"] and len(deck["cards"]) >= 8,
                f"{node_id}: nombre de cartes incohérent")
        require({c["kind"] for c in deck["cards"]} <= KINDS, f"{node_id}: type pédagogique inconnu")
        ids, fronts = set(), set()
        for card in deck["cards"]:
            location = f"{node_id}:{card['id']}"
            require(SLUG.fullmatch(card["id"]) and card["id"] not in ids, f"{location}: ID invalide ou dupliqué")
            require(card["front"] not in fronts, f"{location}: question dupliquée dans le deck")
            ids.add(card["id"])
            fronts.add(card["front"])
            validate_text(card["front"], location + ":front")
            validate_text(card["back"], location + ":back")
        stats[node["grade"]] += len(deck["cards"])

    visiting, visited = set(), set()

    def visit(node_id):
        require(node_id not in visiting, f"Cycle dans les prérequis : {node_id}")
        if node_id in visited:
            return
        visiting.add(node_id)
        for parent in nodes[node_id]["prerequisites"]:
            visit(parent)
        visiting.remove(node_id)
        visited.add(node_id)

    for node_id in nodes:
        visit(node_id)
    print(f"OK : {len(nodes)} decks, {sum(stats.values())} cartes, graphe sans cycle.")
    for grade in ("6e", "5e", "4e", "3e"):
        print(f"  {grade} : {stats[grade]} cartes")


if __name__ == "__main__":
    main()
