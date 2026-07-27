#!/usr/bin/env python3
"""Réorganise mobile/*/lib en auth/, api/, features/ et corrige les imports."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOBILE = ROOT / "mobile"

AUTH_FILES = {"session_store.dart", "user_session.dart", "login_screen.dart"}
API_FILES = {"auth_api.dart", "drive_api.dart", "pass_api.dart", "admin_api.dart"}
KEEP_AT_ROOT = {"main.dart"}
SKIP = {"storage_keys.dart"}

APPS = [
    "calendar",
    "contacts",
    "notes",
    "tasks",
    "mail",
    "drive",
    "photos",
    "pass",
    "admin_app",
]

LOCAL_IMPORT = re.compile(r"^import '([^']+\.dart)';", re.MULTILINE)
PKG_IMPORT = re.compile(r"^import 'package:([^/]+)/([^']+\.dart)';", re.MULTILINE)


def resolve_local_import(current: Path, lib: Path, target: str) -> str:
    name = Path(target).name
    if name in AUTH_FILES:
        return f"import '../auth/{name}';"
    if name in API_FILES:
        return f"import '../api/{name}';"
    if (lib / "features" / name).exists() or name.endswith(".dart"):
        return f"import '../features/{name}';"
    return f"import '{target}';"


def fix_test_file(path: Path, pkg: str) -> None:
    text = path.read_text(encoding="utf-8")

    def pkg_repl(m: re.Match[str]) -> str:
        p, sub = m.group(1), m.group(2)
        if p != pkg:
            return m.group(0)
        if sub == "main.dart":
            return m.group(0)
        name = Path(sub).name
        if name in AUTH_FILES:
            return f"import 'package:{pkg}/auth/{name}';"
        if name in API_FILES:
            return f"import 'package:{pkg}/api/{name}';"
        if sub.startswith(("auth/", "api/", "features/")):
            return m.group(0)
        return f"import 'package:{pkg}/features/{name}';"

    path.write_text(PKG_IMPORT.sub(pkg_repl, text), encoding="utf-8")


def fix_file(path: Path, lib: Path, pkg: str) -> None:
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(lib)
    depth = len(rel.parts) - 1

    def local_repl(m: re.Match[str]) -> str:
        target = m.group(1)
        if target.startswith("package:"):
            return m.group(0)
        if target == "storage_keys.dart":
            return "import 'package:cloudity_shared/storage_keys.dart';"
        if depth == 0:  # main.dart
            name = Path(target).name
            if name in AUTH_FILES:
                return f"import 'auth/{name}';"
            if name in API_FILES:
                return f"import 'api/{name}';"
            return f"import 'features/{name}';"
        if depth == 1 and rel.parts[0] == "auth":
            name = Path(target).name
            if name in AUTH_FILES:
                return f"import '{name}';"
            if name in API_FILES:
                return f"import '../api/{name}';"
            return f"import '../features/{name}';"
        if depth == 1 and rel.parts[0] == "api":
            name = Path(target).name
            if name in AUTH_FILES:
                return f"import '../auth/{name}';"
            if name in API_FILES:
                return f"import '{name}';"
            return f"import '../features/{name}';"
        if depth == 1 and rel.parts[0] == "features":
            name = Path(target).name
            if name in AUTH_FILES:
                return f"import '../auth/{name}';"
            if name in API_FILES:
                return f"import '../api/{name}';"
            return f"import '{name}';"
        return m.group(0)

    text = LOCAL_IMPORT.sub(local_repl, text)

    def pkg_repl(m: re.Match[str]) -> str:
        p, sub = m.group(1), m.group(2)
        if p != pkg:
            if p == "cloudity_mail" and sub != "main.dart":
                # tests orphelins — laisser (seront supprimés)
                return m.group(0)
            return m.group(0)
        if sub == "main.dart":
            return m.group(0)
        name = Path(sub).name
        if name in AUTH_FILES:
            return f"import 'package:{pkg}/auth/{name}';"
        if name in API_FILES:
            return f"import 'package:{pkg}/api/{name}';"
        if sub.startswith("features/"):
            return m.group(0)
        return f"import 'package:{pkg}/features/{name}';"

    text = PKG_IMPORT.sub(pkg_repl, text)
    path.write_text(text, encoding="utf-8")


def reorganize_app(app: str) -> None:
    lib = MOBILE / app / "lib"
    if not lib.is_dir():
        return
    pubspec = MOBILE / app / "pubspec.yaml"
    pkg = app.replace("_app", "")
    if pubspec.exists():
        for line in pubspec.read_text(encoding="utf-8").splitlines():
            if line.startswith("name:"):
                pkg = line.split(":", 1)[1].strip()
                break

    for sub in ("auth", "api", "features"):
        (lib / sub).mkdir(exist_ok=True)

    for dart in list(lib.glob("*.dart")):
        name = dart.name
        if name in KEEP_AT_ROOT:
            fix_file(dart, lib, pkg)
            continue
        if name in SKIP:
            dart.unlink(missing_ok=True)
            continue
        if name in AUTH_FILES:
            shutil.move(str(dart), str(lib / "auth" / name))
        elif name in API_FILES:
            shutil.move(str(dart), str(lib / "api" / name))
        else:
            shutil.move(str(dart), str(lib / "features" / name))

    # Orphelins Mail dans apps légères
    orphan = lib / "features" / "mail_validation.dart"
    if orphan.exists() and app in {"calendar", "contacts", "notes", "tasks"}:
        orphan.unlink()

    for dart in lib.rglob("*.dart"):
        fix_file(dart, lib, pkg)

    # Tests
    test_dir = MOBILE / app / "test"
    if test_dir.is_dir():
        for dart in test_dir.rglob("*.dart"):
            fix_test_file(dart, pkg)

    # Integration tests
    int_dir = MOBILE / app / "integration_test"
    if int_dir.is_dir():
        for dart in int_dir.rglob("*.dart"):
            text = dart.read_text(encoding="utf-8")
            text = text.replace("package:cloudity_mail/main.dart", f"package:{pkg}/main.dart")
            dart.write_text(text, encoding="utf-8")


def main() -> None:
    for app in APPS:
        print(f"→ {app}")
        reorganize_app(app)
    print("✅ Réorganisation terminée")


if __name__ == "__main__":
    main()
