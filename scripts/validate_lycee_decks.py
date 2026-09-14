#!/usr/bin/env python3
"""Validate lycée recall cards and their four progression paths (stdlib only)."""

import json
import re
from collections import Counter

from validate_college_decks import KINDS, ROOT, SLUG, load_curriculum, require, validate_text

COURSES = {
    "2de": (0, "seconde-2026", "2de"),
    "1re-spe": (1, "premiere-spe-2026", "1re spé"),
    "term-spe": (2, "terminale-spe-2019", "Terminale spé"),
    "term-complementaires": (2, "terminale-complementaires-2019", "Terminale complémentaires"),
}


def main():
    manifest, all_nodes = load_curriculum()
    sources = {s["id"]: s for s in manifest["sources"]}
    require({v[1] for v in COURSES.values()} <= set(sources), "Programmes de référence incorrects")
    for source_id in {v[1] for v in COURSES.values()}:
        validate_text(sources[source_id]["label"], f"{source_id}: intitulé de source")

    # Include legacy files at decks/ as well as all subject folders.
    all_decks = {}
    for path in (ROOT / "decks").rglob("*.json"):
        if path.name.startswith("_"):
            continue
        deck = json.loads(path.read_text())
        require(deck["id"] not in all_decks, f"ID de deck dupliqué : {deck['id']}")
        all_decks[deck["id"]] = (path, deck)

    nodes = {nid: n for nid, n in all_nodes.items() if n["grade"] in COURSES}
    require({n["grade"] for n in nodes.values()} == set(COURSES), "Parcours manquant ou inconnu")
    files = {p.stem for course in COURSES
             for p in (ROOT / "decks/maths").glob(f"{course}-*.json")}
    require(files == {nid.removeprefix("math-") for nid in nodes},
            "Les fichiers et le catalogue ne correspondent pas")
    stats, deck_stats = Counter(), Counter()
    for nid, node in nodes.items():
        course = node["grade"]
        rank, source, label = COURSES[course]
        require(SLUG.fullmatch(nid) and node["deck_id"] == nid, f"{nid}: ID incorrect")
        require(nid.startswith(f"math-{course}-"), f"{nid}: préfixe de parcours incorrect")
        require(node["source_id"] == source, f"{nid}: programme incorrect")
        validate_text(node["source_section"], f"{nid}: rubrique du programme")
        validate_text(node["title"], f"{nid}: titre")
        require(len(node["prerequisites"]) == len(set(node["prerequisites"])),
                f"{nid}: prérequis dupliqué")
        for parent in node["prerequisites"]:
            require(parent in nodes, f"{nid}: prérequis inconnu {parent}")
            parent_course = nodes[parent]["grade"]
            require(COURSES[parent_course][0] <= rank, f"{nid}: prérequis d'une classe ultérieure")
            require(not (rank == COURSES[parent_course][0] == 2 and course != parent_course),
                    f"{nid}: dépendance entre les deux parcours de terminale")

        require(nid in all_decks, f"{nid}: deck absent")
        path, deck = all_decks[nid]
        require(path == ROOT / "decks/maths" / f"{nid.removeprefix('math-')}.json",
                f"{nid}: emplacement incorrect")
        require(deck["grade"] == course and deck["curriculum_reference"] == source,
                f"{nid}: métadonnées de parcours incohérentes")
        require(deck["school_year"] == manifest["school_year"], f"{nid}: année incohérente")
        require(deck["subject"] == "Maths" and deck["format"] == "math", f"{nid}: matière ou format incorrect")
        require(deck["title"] == f"Maths · {label} · {node['title']}", f"{nid}: titre incohérent")
        validate_text(deck["description"], f"{nid}: description")
        require(re.fullmatch(r"#[0-9a-fA-F]{6}", deck["color"]), f"{nid}: couleur invalide")
        require(type(deck["daily_new_limit"]) is int and deck["daily_new_limit"] > 0,
                f"{nid}: limite quotidienne incorrecte")
        require(6 <= len(deck["cards"]) <= 16 and len(deck["cards"]) == node["card_count"],
                f"{nid}: nombre de cartes incohérent (petits decks de 6 à 16 cartes)")
        ids, fronts = set(), set()
        for card in deck["cards"]:
            location = f"{nid}:{card['id']}"
            require(card["kind"] in KINDS, f"{location}: type de rappel inconnu")
            require(SLUG.fullmatch(card["id"]) and card["id"] not in ids,
                    f"{location}: ID invalide ou dupliqué")
            require(card["front"] not in fronts, f"{location}: question dupliquée")
            ids.add(card["id"])
            fronts.add(card["front"])
            for side in ("front", "back"):
                validate_text(card[side], f"{location}:{side}")
                require(len(card[side]) <= 320, f"{location}:{side}: texte trop long pour une carte de rappel")
        stats[course] += len(deck["cards"])
        deck_stats[course] += 1

    visiting, visited = set(), set()

    def visit(nid):
        require(nid not in visiting, f"Cycle dans les prérequis : {nid}")
        if nid in visited:
            return
        visiting.add(nid)
        for parent in nodes[nid]["prerequisites"]:
            visit(parent)
        visiting.remove(nid)
        visited.add(nid)

    for nid in nodes:
        visit(nid)
    print(f"OK : {len(nodes)} decks, {sum(stats.values())} cartes, quatre parcours sans cycle.")
    for course in COURSES:
        print(f"  {course} : {deck_stats[course]} decks, {stats[course]} cartes")


if __name__ == "__main__":
    main()
