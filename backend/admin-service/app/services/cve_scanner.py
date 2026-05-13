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
OSV_BATCH_SIZE = 900
MAX_NPM_PACKAGES = 450
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


def collect_go_packages(root: Path) -> list[OsvPackage]:
    pkgs: list[OsvPackage] = []
    for path in root.rglob("go.mod"):
        if "vendor" in path.parts or "node_modules" in path.parts:
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
    lock = root / "frontend" / "apps" / "cloudity-web" / "package-lock.json"
    if not lock.is_file():
        for candidate in root.rglob("package-lock.json"):
            if "node_modules" in candidate.parts:
                continue
            lock = candidate
            break
    if not lock.is_file():
        return pkgs
    try:
        data = json.loads(lock.read_text(encoding="utf-8", errors="replace"))
    except (OSError, json.JSONDecodeError):
        return pkgs
    packages = data.get("packages")
    if not isinstance(packages, dict):
        return pkgs
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
            break
    return pkgs


def collect_pypi_packages(root: Path) -> list[OsvPackage]:
    pkgs: list[OsvPackage] = []
    req = root / "backend" / "admin-service" / "requirements.txt"
    if not req.is_file():
        return pkgs
    try:
        lines = req.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return pkgs
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


def run_osv_batch(packages: list[OsvPackage], timeout: float = 120.0) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Interroge OSV en lots. Retourne (findings_jsonables, notes).
    """
    notes: list[str] = []
    if not packages:
        return [], ["Aucun paquet à analyser (go.mod / package-lock / requirements introuvables)."]

    findings: list[dict[str, Any]] = []
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
                        vid = v.get("id")
                        if not isinstance(vid, str):
                            continue
                        summary = v.get("summary") if isinstance(v.get("summary"), str) else None
                        modified = v.get("modified") if isinstance(v.get("modified"), str) else None
                        cves = _cve_aliases(v.get("aliases"))
                        vulns_out.append(
                            {
                                "osv_id": vid,
                                "summary": summary,
                                "modified": modified,
                                "cve_aliases": cves,
                            }
                        )
                if vulns_out:
                    findings.append(
                        {
                            "ecosystem": pkg.ecosystem,
                            "package": pkg.name,
                            "version": pkg.version,
                            "vulns": vulns_out,
                        }
                    )
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
    notes.append(f"Dépôt scanné : {root} — {len(packages)} paquets uniques (Go + npm + PyPI admin).")

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
        "distinct_osv_ids": sorted({v["osv_id"] for f in findings for v in f.get("vulns", [])})[:200],
    }

    return {
        "findings": findings,
        "packages_scanned": len(packages),
        "packages_with_vulns": len(findings),
        "vuln_entries_total": vuln_entries,
        "notes": notes,
        "summary": summary,
        "source": "https://osv.dev (API querybatch, alignée CVE)",
    }
