"""Tests unitaires (sans réseau) pour le parseur go.mod du scanner CVE."""

from app.services.cve_scanner import OsvPackage, dedupe, parse_go_mod


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
