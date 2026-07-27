"""Signaux ops Pilotage : logs Docker (socket) + crashes mobile (fichiers)."""
from __future__ import annotations

import json
import os
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def docker_sock_path() -> str:
    return (
        os.getenv("DOCKER_SOCK", "").strip()
        or os.getenv("DOCKER_HOST", "").replace("unix://", "").strip()
        or "/var/run/docker.sock"
    )


def _docker_http(method: str, path: str, *, timeout: float = 10.0) -> tuple[int, bytes]:
    sock_path = docker_sock_path()
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(sock_path)
        req = (
            f"{method} {path} HTTP/1.0\r\n"
            f"Host: localhost\r\n"
            f"\r\n"
        ).encode()
        sock.sendall(req)
        chunks: list[bytes] = []
        while True:
            data = sock.recv(65536)
            if not data:
                break
            chunks.append(data)
        raw = b"".join(chunks)
    finally:
        sock.close()
    if b"\r\n\r\n" not in raw:
        return 502, b""
    header, body = raw.split(b"\r\n\r\n", 1)
    status_line = header.split(b"\r\n", 1)[0].decode("latin1", errors="replace")
    try:
        code = int(status_line.split(" ", 2)[1])
    except (IndexError, ValueError):
        code = 502
    return code, body


def list_container_logs(
    service_needles: list[str],
    *,
    tail: int = 60,
) -> tuple[bool, list[str], list[dict[str, Any]]]:
    notes: list[str] = []
    sock = docker_sock_path()
    if not Path(sock).exists():
        notes.append(
            f"Socket Docker absent ({sock}). Dans docker-compose, monte "
            "`/var/run/docker.sock:/var/run/docker.sock:ro` sur admin-service, puis "
            "`docker compose up -d admin-service`."
        )
        return False, notes, []

    try:
        code, body = _docker_http("GET", "/containers/json")
    except OSError as exc:
        notes.append(f"Docker API inaccessible: {exc}")
        return False, notes, []

    if code != 200:
        notes.append(f"Docker API /containers/json → HTTP {code}")
        return False, notes, []

    try:
        all_c = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        notes.append("Réponse Docker JSON invalide")
        return False, notes, []

    by_name: list[tuple[str, str]] = []
    for c in all_c:
        cid = c.get("Id") or ""
        for n in c.get("Names") or []:
            by_name.append((str(n).lstrip("/"), cid))

    lim = max(10, min(int(tail or 60), 200))
    results: list[dict[str, Any]] = []
    for needle in service_needles:
        matches = [(n, i) for n, i in by_name if needle in n]
        if not matches:
            results.append(
                {
                    "service": needle,
                    "container": None,
                    "ok": False,
                    "lines": [],
                    "errors": [],
                    "error": "Conteneur non trouvé (pas démarré ?)",
                }
            )
            continue
        cname, cid = matches[0]
        short = cid[:12]
        try:
            path = f"/containers/{short}/logs?stdout=1&stderr=1&timestamps=0&tail={lim}"
            lcode, lbody = _docker_http("GET", path, timeout=12.0)
            if lcode != 200:
                results.append(
                    {
                        "service": needle,
                        "container": cname,
                        "ok": False,
                        "lines": [],
                        "errors": [],
                        "error": f"logs HTTP {lcode}",
                    }
                )
                continue
            text = _decode_docker_logs(lbody)
            lines = [ln for ln in text.splitlines() if ln.strip()][-lim:]
            interesting = [
                ln
                for ln in lines
                if any(
                    k in ln.lower()
                    for k in ("error", "err", "fatal", "panic", "cors", "403", "401", "tls", "cert")
                )
            ]
            results.append(
                {
                    "service": needle,
                    "container": cname,
                    "ok": True,
                    "lines": lines[-40:],
                    "errors": interesting[-15:],
                }
            )
        except OSError as exc:
            results.append(
                {
                    "service": needle,
                    "container": cname,
                    "ok": False,
                    "lines": [],
                    "errors": [],
                    "error": str(exc),
                }
            )
    return True, notes, results


def _decode_docker_logs(raw: bytes) -> str:
    if not raw:
        return ""
    out = bytearray()
    i = 0
    multiplexed = False
    while i + 8 <= len(raw):
        stream = raw[i]
        size = int.from_bytes(raw[i + 4 : i + 8], "big")
        if stream not in (0, 1, 2) or size < 0 or i + 8 + size > len(raw):
            break
        multiplexed = True
        out.extend(raw[i + 8 : i + 8 + size])
        i += 8 + size
    if multiplexed and out:
        return out.decode("utf-8", errors="replace")
    return raw.decode("utf-8", errors="replace")


def mobile_crash_dirs() -> list[Path]:
    env = os.getenv("MOBILE_CRASH_LOG_DIR", "").strip()
    candidates: list[Path] = []
    if env:
        candidates.append(Path(env))
    candidates.extend(
        [
            Path("/mobile-crashes"),
            Path("/cloudity-repo/backend/api-gateway/storage/mobile-crashes"),
        ]
    )
    seen: set[str] = set()
    out: list[Path] = []
    for p in candidates:
        key = str(p)
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def list_mobile_crashes(limit: int = 20) -> dict[str, Any]:
    lim = max(1, min(int(limit or 20), 100))
    items: list[dict[str, Any]] = []
    used: Path | None = None
    notes: list[str] = []
    for d in mobile_crash_dirs():
        if not d.is_dir():
            continue
        used = d
        files = sorted(d.glob("crash-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for f in files[:lim]:
            try:
                st = f.stat()
                cid = f.name[len("crash-") : -len(".json")]
                items.append(
                    {
                        "id": cid,
                        "filename": f.name,
                        "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                        "sizeBytes": st.st_size,
                    }
                )
            except OSError:
                continue
        break
    if used is None:
        notes.append(
            "Aucun crash enregistré pour l’instant (normal si aucune app n’a posté). "
            "Les apps Flutter envoient POST `/mobile/crashes` → dossier gateway "
            "`storage/mobile-crashes` (monté aussi sur admin en `/mobile-crashes`)."
        )
    return {"items": items, "dir": str(used) if used else None, "notes": notes, "at": _now_iso()}


def read_mobile_crash(crash_id: str) -> dict[str, Any] | None:
    cid = (crash_id or "").strip()
    if not cid or ".." in cid or "/" in cid:
        return None
    name = f"crash-{cid}.json"
    for d in mobile_crash_dirs():
        path = d / name
        if path.is_file():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return {"error": "invalid crash file", "id": cid}
    return None
