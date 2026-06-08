"""
Agrégation de vulnérabilités via l’API publique OSV (https://osv.dev),
alignée sur la base CVE / ecosystem records officiels.

Ne remplace pas un audit humain ni govulncheck en CI : couverture limitée aux
écosystèmes parsés (Go, npm, PyPI) et aux versions exactes déclarées dans le dépôt.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import httpx

OSV_QUERY_BATCH_URL = "https://api.osv.dev/v1/querybatch"
OSV_VULN_URL = "https://api.osv.dev/v1/vulns/{vuln_id}"
OSV_BATCH_SIZE = 900
MAX_NPM_PACKAGES = 5000
GO_MOD_NAME = re.compile(r"^(\S+)\s+(\S+)\s*$")


@dataclass(frozen=True)
class OsvPackage:
    ecosystem: str
    name: str
    version: str


def _repo_root() -> Path | None:
    raw = (os.getenv("CVE_SCAN_REPO_ROOT") or "").strip()
    if not raw:
        return None
    p = Path(raw).resolve()
    if not p.is_dir():
        return None
    return p


def parse_go_mod(text: str) -> list[tuple[str, str]]:
    """Extrait (module, version) depuis le contenu d'un go.mod."""
    out: list[tuple[str, str]] = []
    in_block = False
    for line in text.splitlines():
        stripped = line.split("//", 1)[0].strip()
        if not stripped:
            continue
        if stripped.startswith("require ("):
            in_block = True
            continue
        if in_block:
            if stripped.startswith(")"):
                in_block = False
                continue
            if "=>" in stripped:
                continue
            m = GO_MOD_NAME.match(stripped)
            if m:
                mod, ver = m.group(1), m.group(2)
                if ver.startswith("v") or ver[0].isdigit():
                    out.append((mod, ver))
            continue
        if stripped.startswith("require ") and "(" not in stripped:
            parts = stripped.split()
            if len(parts) >= 3 and parts[1] != "(" and "=>" not in stripped:
                ver = parts[2]
                if ver.startswith("v") or ver[0].isdigit():
                    out.append((parts[1], ver))
    return out


def _ignored_manifest(path: Path) -> bool:
    ignored_parts = {"node_modules", "vendor", ".git", ".venv", "venv", "dist", "build"}
    return any(part in ignored_parts for part in path.parts)


def collect_go_packages(root: Path) -> list[OsvPackage]:
    pkgs: list[OsvPackage] = []
    for path in root.rglob("go.mod"):
        if _ignored_manifest(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for mod, ver in parse_go_mod(text):
            if mod and ver:
                pkgs.append(OsvPackage("Go", mod, ver))
    return pkgs


def collect_npm_packages(root: Path) -> list[OsvPackage]:
    pkgs: list[OsvPackage] = []
    for lock in sorted(root.rglob("package-lock.json")):
        if _ignored_manifest(lock):
            continue
        try:
            data = json.loads(lock.read_text(encoding="utf-8", errors="replace"))
        except (OSError, json.JSONDecodeError):
            continue
        packages = data.get("packages")
        if not isinstance(packages, dict):
            continue
        for rel_path, meta in packages.items():
            if not isinstance(meta, dict):
                continue
            if not isinstance(rel_path, str) or not rel_path.startswith("node_modules/"):
                continue
            name = rel_path.removeprefix("node_modules/")
            if not name or name.startswith("."):
                continue
            ver = meta.get("version")
            if not isinstance(ver, str) or not ver.strip():
                continue
            pkgs.append(OsvPackage("npm", name, ver.strip()))
            if len(pkgs) >= MAX_NPM_PACKAGES:
                return pkgs
    return pkgs


def collect_pypi_packages(root: Path) -> list[OsvPackage]:
    pkgs: list[OsvPackage] = []
    for req in sorted(root.rglob("requirements*.txt")):
        if _ignored_manifest(req):
            continue
        try:
            lines = req.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            s = line.split("#", 1)[0].strip()
            if not s or s.startswith("-"):
                continue
            name: str | None = None
            ver: str | None = None
            if "===" in s:
                name, _, ver = s.partition("===")
            elif "==" in s:
                name, _, ver = s.partition("==")
            elif ">=" in s:
                name, _, ver = s.partition(">=")
            else:
                continue
            name = name.strip()
            ver = ver.strip().split(";")[0].strip() if ver else ""
            if name and ver:
                pkgs.append(OsvPackage("PyPI", name.lower().replace("_", "-"), ver))
    return pkgs


def manifest_inventory(root: Path) -> dict[str, int]:
    return {
        "go_mod": sum(1 for p in root.rglob("go.mod") if not _ignored_manifest(p)),
        "package_lock": sum(1 for p in root.rglob("package-lock.json") if not _ignored_manifest(p)),
        "requirements": sum(1 for p in root.rglob("requirements*.txt") if not _ignored_manifest(p)),
    }


def dedupe(packages: Iterable[OsvPackage]) -> list[OsvPackage]:
    seen: set[tuple[str, str, str]] = set()
    out: list[OsvPackage] = []
    for p in packages:
        key = (p.ecosystem, p.name, p.version)
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _cve_aliases(aliases: Any) -> list[str]:
    if not isinstance(aliases, list):
        return []
    cves = [a for a in aliases if isinstance(a, str) and a.upper().startswith("CVE-")]
    return sorted(set(cves))


def _aliases(aliases: Any) -> list[str]:
    if not isinstance(aliases, list):
        return []
    return sorted({a.strip() for a in aliases if isinstance(a, str) and a.strip()})[:50]


def _summary_from_details(details: Any) -> str | None:
    if not isinstance(details, str):
        return None
    compact = " ".join(details.strip().split())
    if not compact:
        return None
    for sep in (". ", "\n"):
        if sep in compact:
            first = compact.split(sep, 1)[0].strip()
            if first:
                return f"{first}."
    return compact[:220]


def _severity(vuln: dict[str, Any]) -> str | None:
    severity = vuln.get("severity")
    if isinstance(severity, list):
        scores = []
        for row in severity:
            if not isinstance(row, dict):
                continue
            score = row.get("score")
            typ = row.get("type")
            if isinstance(score, str) and score.strip():
                scores.append(f"{typ}: {score}" if isinstance(typ, str) and typ else score)
        if scores:
            return " · ".join(scores[:3])
    db_specific = vuln.get("database_specific")
    if isinstance(db_specific, dict):
        value = db_specific.get("severity")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _fixed_versions(vuln: dict[str, Any]) -> list[str]:
    fixed: set[str] = set()
    affected = vuln.get("affected")
    if not isinstance(affected, list):
        return []
    for aff in affected:
        if not isinstance(aff, dict):
            continue
        ranges = aff.get("ranges")
        if not isinstance(ranges, list):
            continue
        for rng in ranges:
            if not isinstance(rng, dict):
                continue
            events = rng.get("events")
            if not isinstance(events, list):
                continue
            for event in events:
                if not isinstance(event, dict):
                    continue
                value = event.get("fixed")
                if isinstance(value, str) and value.strip():
                    fixed.add(value.strip())
    return sorted(fixed)[:20]


def _affected_ranges(vuln: dict[str, Any]) -> list[str]:
    out: list[str] = []
    affected = vuln.get("affected")
    if not isinstance(affected, list):
        return out
    for aff in affected:
        if not isinstance(aff, dict):
            continue
        ranges = aff.get("ranges")
        if not isinstance(ranges, list):
            continue
        for rng in ranges:
            if not isinstance(rng, dict):
                continue
            typ = rng.get("type") if isinstance(rng.get("type"), str) else "range"
            introduced: str | None = None
            fixed: str | None = None
            last_affected: str | None = None
            events = rng.get("events")
            if isinstance(events, list):
                for event in events:
                    if not isinstance(event, dict):
                        continue
                    if isinstance(event.get("introduced"), str):
                        introduced = event["introduced"]
                    if isinstance(event.get("fixed"), str):
                        fixed = event["fixed"]
                    if isinstance(event.get("last_affected"), str):
                        last_affected = event["last_affected"]
            if introduced or fixed or last_affected:
                end = fixed or last_affected or "?"
                out.append(f"{typ}: {introduced or '?'} → {end}")
    return out[:20]


def _vuln_entry_from_osv(vuln: dict[str, Any]) -> dict[str, Any] | None:
    vid = vuln.get("id")
    if not isinstance(vid, str) or not vid:
        return None
    summary = vuln.get("summary") if isinstance(vuln.get("summary"), str) else None
    if not summary:
        summary = _summary_from_details(vuln.get("details"))
    modified = vuln.get("modified") if isinstance(vuln.get("modified"), str) else None
    return {
        "osv_id": vid,
        "summary": summary,
        "details": vuln.get("details") if isinstance(vuln.get("details"), str) else None,
        "modified": modified,
        "aliases": _aliases(vuln.get("aliases")),
        "cve_aliases": _cve_aliases(vuln.get("aliases")),
        "severity": _severity(vuln),
        "fixed_versions": _fixed_versions(vuln),
        "affected_ranges": _affected_ranges(vuln),
    }


def _fetch_vuln_details(client: httpx.Client, vuln_ids: set[str], notes: list[str]) -> dict[str, dict[str, Any]]:
    details: dict[str, dict[str, Any]] = {}
    for vuln_id in sorted(vuln_ids):
        try:
            r = client.get(OSV_VULN_URL.format(vuln_id=vuln_id))
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            notes.append(f"Détail OSV indisponible pour {vuln_id}: {exc}")
            continue
        if isinstance(data, dict):
            entry = _vuln_entry_from_osv(data)
            if entry is not None:
                details[vuln_id] = entry
    return details


def run_osv_batch(packages: list[OsvPackage], timeout: float = 120.0) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Interroge OSV en lots. Retourne (findings_jsonables, notes).
    """
    notes: list[str] = []
    if not packages:
        return [], ["Aucun paquet à analyser (go.mod / package-lock / requirements introuvables)."]

    findings: list[dict[str, Any]] = []
    vuln_ids: set[str] = set()
    with httpx.Client(timeout=timeout) as client:
        for i in range(0, len(packages), OSV_BATCH_SIZE):
            chunk = packages[i : i + OSV_BATCH_SIZE]
            body = {
                "queries": [
                    {"package": {"ecosystem": p.ecosystem, "name": p.name}, "version": p.version} for p in chunk
                ]
            }
            try:
                r = client.post(OSV_QUERY_BATCH_URL, json=body)
                r.raise_for_status()
            except httpx.HTTPError as exc:
                notes.append(f"Erreur HTTP OSV (lot {i // OSV_BATCH_SIZE + 1}): {exc}")
                continue
            try:
                data = r.json()
            except json.JSONDecodeError:
                notes.append("Réponse OSV non JSON.")
                continue
            results = data.get("results")
            if not isinstance(results, list) or len(results) != len(chunk):
                notes.append("Réponse OSV: taille results inattendue.")
                continue
            for pkg, res in zip(chunk, results, strict=True):
                vulns_raw = res.get("vulns") if isinstance(res, dict) else None
                vulns_out: list[dict[str, Any]] = []
                if isinstance(vulns_raw, list):
                    for v in vulns_raw:
                        if not isinstance(v, dict):
                            continue
                        entry = _vuln_entry_from_osv(v)
                        if entry is None:
                            continue
                        vuln_ids.add(entry["osv_id"])
                        vulns_out.append(entry)
                if vulns_out:
                    findings.append(
                        {
                            "ecosystem": pkg.ecosystem,
                            "package": pkg.name,
                            "version": pkg.version,
                            "vulns": vulns_out,
                        }
                    )
        details = _fetch_vuln_details(client, vuln_ids, notes)
        if details:
            for finding in findings:
                for vuln in finding.get("vulns", []):
                    if not isinstance(vuln, dict):
                        continue
                    enriched = details.get(str(vuln.get("osv_id", "")))
                    if not enriched:
                        continue
                    for key, value in enriched.items():
                        if value not in (None, [], ""):
                            vuln[key] = value
    return findings, notes


def build_report_payload() -> dict[str, Any]:
    root = _repo_root()
    if root is None:
        return {
            "error": "CVE_SCAN_REPO_ROOT absent ou dossier illisible. "
            "Montez la racine du dépôt en lecture seule (ex. docker-compose : .:/cloudity-repo:ro) "
            "et définissez CVE_SCAN_REPO_ROOT=/cloudity-repo.",
            "findings": [],
            "packages_scanned": 0,
            "packages_with_vulns": 0,
            "vuln_entries_total": 0,
            "notes": [],
        }

    notes: list[str] = []
    collected: list[OsvPackage] = []
    collected.extend(collect_go_packages(root))
    collected.extend(collect_npm_packages(root))
    collected.extend(collect_pypi_packages(root))
    packages = dedupe(collected)
    manifests = manifest_inventory(root)
    ecosystem_counts = {
        eco: sum(1 for p in packages if p.ecosystem == eco)
        for eco in sorted({p.ecosystem for p in packages})
    }
    notes.append(
        f"Dépôt scanné : {root} — {len(packages)} paquets uniques "
        f"(Go + npm + PyPI). Manifests : {manifests['go_mod']} go.mod, "
        f"{manifests['package_lock']} package-lock.json, {manifests['requirements']} requirements*.txt."
    )
    notes.append(
        "Couverture paquets : "
        + ", ".join(f"{eco}={count}" for eco, count in ecosystem_counts.items())
        + "."
    )

    findings, batch_notes = run_osv_batch(packages)
    notes.extend(batch_notes)

    vuln_entries = sum(len(f["vulns"]) for f in findings)
    summary = {
        "distinct_cve_like": sorted(
            {
                cve
                for f in findings
                for v in f.get("vulns", [])
                for cve in v.get("cve_aliases", [])
            }
        )[:200],
        "distinct_aliases": sorted(
            {
                alias
                for f in findings
                for v in f.get("vulns", [])
                for alias in v.get("aliases", [])
            }
        )[:300],
        "distinct_osv_ids": sorted({v["osv_id"] for f in findings for v in f.get("vulns", [])})[:200],
    }

    return {
        "findings": findings,
        "packages_scanned": len(packages),
        "packages_with_vulns": len(findings),
        "vuln_entries_total": vuln_entries,
        "notes": notes,
        "summary": summary,
        "manifests": manifests,
        "ecosystem_package_counts": ecosystem_counts,
        "source": "https://osv.dev (API querybatch, alignée CVE)",
    }
