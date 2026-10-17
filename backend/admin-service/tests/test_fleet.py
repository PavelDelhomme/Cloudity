"""Versions déployées et disque, sans réseau."""
import os
import tempfile

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/cloudity")

from app.services.disk_usage import collect_disk
from app.services.fleet import collect_fleet, summarize_feed


def test_canonical_package_is_preferred_when_top_is_legacy():
    payload = {
        "version": "1.0.26",
        "versionCode": 27,
        "package": "fr.cloudity.cloudity_mail",
        "apk": "https://mail.hubera.cloud/apk/legacy/hubera-mail.apk",
        "forceUpdate": False,
        "canonical": {
            "version": "1.0.26",
            "versionCode": 27,
            "package": "cloud.hubera.mail",
            "apk": "https://mail.hubera.cloud/apk/hubera-mail.apk",
        },
    }
    row = summarize_feed("mail", "Mail", "https://mail.hubera.cloud/updates.json", payload)
    assert row["package"] == "cloud.hubera.mail"
    assert row["version"] == "1.0.26"
    assert row["versionCode"] == 27
    assert row["canonicalFirst"] is False
    assert row["forceUpdate"] is False


def test_canonical_first_when_top_package_is_hubera():
    payload = {
        "version": "0.1.107",
        "versionCode": 108,
        "package": "cloud.hubera.maps",
        "forceUpdate": False,
        "canonical": {"package": "cloud.hubera.maps", "version": "0.1.107", "versionCode": 108},
    }
    row = summarize_feed("maps", "Maps", "https://maps.hubera.cloud/updates.json", payload)
    assert row["canonicalFirst"] is True
    assert row["package"] == "cloud.hubera.maps"


def test_collect_fleet_keeps_a_row_when_a_feed_fails():
    def fetch(url: str):
        if "music" in url:
            return {"version": "1.3.373", "versionCode": 10673, "package": "cloud.hubera.music", "forceUpdate": False}
        raise OSError("down")

    data = collect_fleet(fetch)
    by_slug = {a["slug"]: a for a in data["apps"]}
    assert by_slug["music"]["version"] == "1.3.373"
    assert by_slug["music"]["error"] is None
    assert by_slug["fuel"]["error"]
    assert by_slug["fuel"]["version"] is None


def test_disk_skips_missing_paths():
    with tempfile.TemporaryDirectory() as tmp:
        present = os.path.join(tmp, "data")
        os.mkdir(present)
        data = collect_disk([present, os.path.join(tmp, "absent")])
    assert len(data["mounts"]) == 1
    assert data["mounts"][0]["path"] == str(present)
    assert data["mounts"][0]["totalBytes"] > 0
    assert 0 <= data["mounts"][0]["usedPercent"] <= 100
