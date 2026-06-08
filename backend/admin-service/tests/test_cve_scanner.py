"""Tests unitaires (sans réseau) pour le parseur go.mod du scanner CVE."""

import json

from app.services.cve_scanner import (
    OsvPackage,
    _vuln_entry_from_osv,
    collect_npm_packages,
    collect_pypi_packages,
    dedupe,
    manifest_inventory,
    parse_go_mod,
)


def test_parse_go_mod_block():
    text = """
module example.com/foo

require (
    github.com/a/b v1.2.3
    // comment
    github.com/c/d v0.0.0-20200101000000-abcdef123456
    github.com/replaced/x v1.0.0 => ./local
)
"""
    got = parse_go_mod(text)
    assert ("github.com/a/b", "v1.2.3") in got
    assert ("github.com/c/d", "v0.0.0-20200101000000-abcdef123456") in got
    assert all("replaced" not in m for m, _ in got)


def test_parse_go_mod_inline():
    text = 'require golang.org/x/net v0.38.0\n'
    got = parse_go_mod(text)
    assert got == [("golang.org/x/net", "v0.38.0")]


def test_dedupe_osv():
    a = [
        OsvPackage("Go", "x/y", "v1.0.0"),
        OsvPackage("Go", "x/y", "v1.0.0"),
        OsvPackage("npm", "lodash", "4.17.21"),
    ]
    assert len(dedupe(a)) == 2


def test_vuln_entry_enriches_aliases_severity_and_fixed_versions():
    entry = _vuln_entry_from_osv(
        {
            "id": "GO-2026-0001",
            "aliases": ["CVE-2026-1234", "GHSA-abcd-1234-zzzz"],
            "details": "A crafted input can trigger excessive CPU usage. Upgrade now.",
            "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"}],
            "affected": [
                {
                    "ranges": [
                        {
                            "type": "SEMVER",
                            "events": [{"introduced": "0"}, {"fixed": "1.2.3"}],
                        }
                    ]
                }
            ],
            "modified": "2026-06-01T00:00:00Z",
        }
    )

    assert entry is not None
    assert entry["summary"] == "A crafted input can trigger excessive CPU usage."
    assert entry["cve_aliases"] == ["CVE-2026-1234"]
    assert "GHSA-abcd-1234-zzzz" in entry["aliases"]
    assert entry["fixed_versions"] == ["1.2.3"]
    assert entry["affected_ranges"] == ["SEMVER: 0 → 1.2.3"]
    assert entry["severity"].startswith("CVSS_V3:")


def test_collects_all_npm_and_python_manifests(tmp_path):
    (tmp_path / "frontend").mkdir()
    (tmp_path / "extensions").mkdir()
    (tmp_path / "backend").mkdir()
    (tmp_path / "frontend" / "package-lock.json").write_text(
        json.dumps({"packages": {"node_modules/react": {"version": "18.2.0"}}})
    )
    (tmp_path / "extensions" / "package-lock.json").write_text(
        json.dumps({"packages": {"node_modules/esbuild": {"version": "0.24.2"}}})
    )
    (tmp_path / "backend" / "requirements.txt").write_text("fastapi==0.109.1\n")
    (tmp_path / "backend" / "requirements-dev.txt").write_text("pytest>=9.0.3\n")

    npm = collect_npm_packages(tmp_path)
    pypi = collect_pypi_packages(tmp_path)

    assert OsvPackage("npm", "react", "18.2.0") in npm
    assert OsvPackage("npm", "esbuild", "0.24.2") in npm
    assert OsvPackage("PyPI", "fastapi", "0.109.1") in pypi
    assert OsvPackage("PyPI", "pytest", "9.0.3") in pypi
    assert manifest_inventory(tmp_path) == {"go_mod": 0, "package_lock": 2, "requirements": 2}
