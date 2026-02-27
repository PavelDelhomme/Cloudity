#!/usr/bin/env python3
"""
Exporte les favoris Brave vers un fichier HTML (format Netscape) importable dans LibreWolf.

Usage:
  python3 export-brave-favoris.py [--output FICHIER]
  ./export-brave-favoris.py

Brave doit être fermé (ou le fichier en lecture seule) pour éviter corruption.
Import dans LibreWolf : Menu → Favoris → Gérer les favoris → Import et sauvegarde → Importer les favoris depuis un fichier HTML.
"""

import argparse
import html
import json
import os
from pathlib import Path


def brave_bookmarks_path() -> Path:
    """Chemin du fichier Bookmarks de Brave sous Linux."""
    return Path.home() / ".config" / "BraveSoftware" / "Brave-Browser" / "Default" / "Bookmarks"


def netscape_escape(s: str) -> str:
    """Échappe pour attributs HTML (Netscape bookmark)."""
    return html.escape(s, quote=True)


def node_to_html(node: dict, indent: str = "") -> str:
    """Convertit un nœud (dossier ou URL) en HTML Netscape."""
    name = node.get("name", "")
    node_type = node.get("type", "url")
    if node_type == "url":
        url = node.get("url", "")
        if not url:
            return ""
        add_date = node.get("date_added", "")
        add_date_attr = f' ADD_DATE="{add_date}"' if add_date else ""
        return f'{indent}<DT><A HREF="{netscape_escape(url)}"{add_date_attr}>{netscape_escape(name)}</A>\n'
    if node_type == "folder":
        children = node.get("children", [])
        lines = [f'{indent}<DT><H3>{netscape_escape(name)}</H3>\n', f"{indent}<DL><p>\n"]
        for child in children:
            lines.append(node_to_html(child, indent + "    "))
        lines.append(f"{indent}</DL><p>\n")
        return "".join(lines)
    return ""


def roots_to_html(roots: dict) -> str:
    """Convertit l'objet roots de Brave en HTML."""
    parts = [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        "<TITLE>Favoris Brave</TITLE>",
        "<H1>Favoris Brave</H1>",
        "<DL><p>",
    ]
    # bookmark_bar = barre de favoris, other = autre dossier, synced = synchronisés
    for key in ("bookmark_bar", "other", "synced"):
        if key not in roots:
            continue
        node = roots[key]
        name = node.get("name", key)
        children = node.get("children", [])
        if not children:
            continue
        parts.append(f'<DT><H3>{netscape_escape(name)}</H3>')
        parts.append("\n<DL><p>\n")
        for child in children:
            parts.append(node_to_html(child, "    "))
        parts.append("</DL><p>\n")
    parts.append("</DL><p>")
    return "\n".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Exporte les favoris Brave en HTML pour LibreWolf/Firefox."
    )
    parser.add_argument(
        "--output", "-o",
        default="brave-favoris-export.html",
        help="Fichier HTML de sortie (défaut: brave-favoris-export.html)",
    )
    parser.add_argument(
        "--source",
        default=None,
        help="Fichier Bookmarks Brave (défaut: ~/.config/BraveSoftware/Brave-Browser/Default/Bookmarks)",
    )
    args = parser.parse_args()

    source = Path(args.source) if args.source else brave_bookmarks_path()
    if not source.exists():
        print(f"Erreur: fichier introuvable: {source}")
        print("Ferme Brave puis relance le script, ou indique --source CHEMIN.")
        raise SystemExit(1)

    with open(source, "r", encoding="utf-8") as f:
        data = json.load(f)

    roots = data.get("roots", {})
    if not roots:
        print("Aucun favori trouvé dans le fichier Brave.")
        raise SystemExit(0)

    out_path = Path(args.output)
    html_content = roots_to_html(roots)
    out_path.write_text(html_content, encoding="utf-8")

    print(f"Export terminé: {out_path.absolute()}")
    print()
    print("Import dans LibreWolf:")
    print("  1. Menu → Favoris → Gérer les favoris")
    print("  2. Import et sauvegarde → Importer les favoris depuis un fichier HTML")
    print(f"  3. Choisir le fichier: {out_path.absolute()}")


if __name__ == "__main__":
    main()
