#!/usr/bin/env bash
# Génère assetlinks.json pour passkeys Android (Digital Asset Links).
# Usage :
#   ./scripts/mobile/mobile-generate-assetlinks.sh dist/mobile-apk/cloudity_mail-0.1.0.apk
#   SHA256=3C:F6:... ./scripts/mobile/mobile-generate-assetlinks.sh --stdout
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

PACKAGES=(
  fr.cloudity.cloudity_mail
  fr.cloudity.cloudity_drive
  fr.cloudity.cloudity_photos
  com.cloudity.cloudity_pass
  fr.cloudity.cloudity_calendar
  fr.cloudity.cloudity_contacts
  fr.cloudity.cloudity_notes
  fr.cloudity.cloudity_tasks
  fr.cloudity.admin_app
)

sha_from_apk() {
  local apk="$1"
  apksigner verify --print-certs "$apk" 2>/dev/null \
    | awk -F': ' '/SHA-256 digest:/ {print toupper($2); exit}' \
    | sed 's/\(..\)/\1:/g; s/:$//; s/://g' \
    | sed 's/\(..\)/\1:/g; s/:$//' \
    | python3 -c "
import sys
h=sys.stdin.read().strip().replace(':','')
print(':'.join(h[i:i+2].upper() for i in range(0,len(h),2)))
"
}

android_webauthn_origin() {
  local fp_hex="${1//:/}"
  python3 -c "
import base64
h=bytes.fromhex('${fp_hex.lower()}')
print('android:apk-key-hash:'+base64.urlsafe_b64encode(h).decode().rstrip('='))
"
}

FP="${SHA256:-}"
if [[ -z "$FP" && "${1:-}" != "--stdout" && -n "${1:-}" ]]; then
  FP="$(sha_from_apk "$1")"
fi
if [[ -z "$FP" ]]; then
  echo "❌ SHA256 requis (SHA256=… ou chemin APK)" >&2
  exit 1
fi

OUT="$ROOT/infrastructure/nginx/assetlinks.prod.json"
FRONT="$ROOT/frontend/apps/cloudity-web/.well-known/assetlinks.json"
mkdir -p "$(dirname "$FRONT")"

python3 - "$FP" "${PACKAGES[@]}" <<'PY' > "$OUT"
import json, sys
fp = sys.argv[1]
pkgs = sys.argv[2:]
entries = []
for pkg in pkgs:
    entries.append({
        "relation": [
            "delegate_permission/common.handle_all_urls",
            "delegate_permission/common.get_login_creds",
        ],
        "target": {
            "namespace": "android_app",
            "package_name": pkg,
            "sha256_cert_fingerprints": [fp],
        },
    })
print(json.dumps(entries, indent=2))
PY

cp "$OUT" "$FRONT"
echo "✅ $OUT"
echo "✅ $FRONT"
echo "   Origin WebAuthn Android : $(android_webauthn_origin "$FP")"
echo "   → ajouter à WEBAUTHN_ORIGINS dans stack.env / Portainer"
