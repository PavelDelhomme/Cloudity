"""Occupation disque vue par le conteneur admin. Pas un rapport Docs."""
from __future__ import annotations

import os
import shutil


def _mount(path: str) -> dict | None:
    if not path or not os.path.isdir(path):
        return None
    usage = shutil.disk_usage(path)
    total = int(usage.total)
    used = int(usage.used)
    free = int(usage.free)
    percent = round((used / total) * 100, 1) if total else 0
    return {
        "path": path,
        "totalBytes": total,
        "usedBytes": used,
        "freeBytes": free,
        "usedPercent": percent,
    }


def collect_disk(paths: list[str] | None = None) -> dict:
    raw = paths
    if raw is None:
        env = os.environ.get("ADMIN_DISK_PATHS", "/,/var/lib/docker")
        raw = [p.strip() for p in env.split(",") if p.strip()]
    mounts = []
    seen = set()
    for path in raw:
        if path in seen:
            continue
        seen.add(path)
        row = _mount(path)
        if row:
            mounts.append(row)
    return {"mounts": mounts}
