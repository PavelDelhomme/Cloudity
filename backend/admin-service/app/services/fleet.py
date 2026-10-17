"""Versions publiques des apps Hubera, lues côté serveur (pas le cahier Docs)."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Callable

# Flux publics déjà en production. Le paquet canonique est celui que le téléphone Nothing lit.
FLEET_FEEDS: tuple[tuple[str, str, str], ...] = (
    ("music", "Music", "https://music.hubera.cloud/updates.json"),
    ("fuel", "Fuel", "https://fuel.hubera.cloud/updates.json"),
    ("maps", "Maps", "https://maps.hubera.cloud/updates.json"),
    ("mail", "Mail", "https://mail.hubera.cloud/updates.json"),
    ("calendar", "Agenda", "https://calendar.hubera.cloud/updates.json"),
    ("contacts", "Contacts", "https://contacts.hubera.cloud/updates.json"),
    ("notes", "Notes", "https://notes.hubera.cloud/updates.json"),
    ("photos", "Photos", "https://photos.hubera.cloud/updates.json"),
    ("pass", "Pass", "https://pass.hubera.cloud/updates.json"),
    ("cook", "Cook", "https://cook.hubera.cloud/updates.json"),
    ("drive", "Drive", "https://drive.hubera.cloud/updates.json"),
    ("tasks", "Tasks", "https://tasks.hubera.cloud/updates.json"),
    ("id", "ID", "https://id.hubera.cloud/updates.json"),
    ("docs", "Docs", "https://docs.hubera.cloud/updates.json"),
    ("admin", "Admin", "https://cloudity.delhomme.ovh/updates.json"),
)


def _pkg(node: dict | None) -> str:
    if not isinstance(node, dict):
        return ""
    return str(node.get("package") or node.get("packageName") or "").strip()


def summarize_feed(slug: str, label: str, url: str, payload: dict) -> dict:
    """Le paquet affiché est le canonique cloud.hubera.* quand le flux le porte."""
    canonical = payload.get("canonical") if isinstance(payload.get("canonical"), dict) else None
    top_pkg = _pkg(payload)
    canon_pkg = _pkg(canonical)
    shown = canonical if canon_pkg.startswith("cloud.hubera.") else payload
    package = _pkg(shown) or top_pkg
    version = shown.get("version") or payload.get("version")
    code = shown.get("versionCode")
    if code is None:
        code = payload.get("versionCode")
    apk = ""
    if isinstance(shown, dict):
        apk = str(shown.get("apk") or shown.get("apk_url") or shown.get("apkUrl") or "")
    if not apk:
        apk = str(payload.get("apk") or payload.get("apk_url") or payload.get("apkUrl") or "")
    return {
        "slug": slug,
        "label": label,
        "feed": url,
        "version": version,
        "versionCode": code,
        "package": package,
        "topPackage": top_pkg or package,
        "canonicalFirst": bool(top_pkg.startswith("cloud.hubera.")),
        "apk": apk,
        "forceUpdate": bool(payload.get("forceUpdate")),
        "error": None,
    }


def _fetch_json(url: str, timeout: float = 6.0) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "hubera-admin-fleet"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read(200_000)
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("feed is not an object")
    return data


def collect_fleet(fetch: Callable[[str], dict] | None = None) -> dict:
    getter = fetch or _fetch_json
    apps = []
    for slug, label, url in FLEET_FEEDS:
        try:
            apps.append(summarize_feed(slug, label, url, getter(url)))
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError, OSError) as exc:
            apps.append(
                {
                    "slug": slug,
                    "label": label,
                    "feed": url,
                    "version": None,
                    "versionCode": None,
                    "package": None,
                    "topPackage": None,
                    "canonicalFirst": False,
                    "apk": None,
                    "forceUpdate": False,
                    "error": str(exc),
                }
            )
    return {"apps": apps}
