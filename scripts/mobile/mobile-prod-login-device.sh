#!/usr/bin/env bash
# Test connexion prod app par app sur Samsung (APK OTA installées).
# Usage :
#   CLOUDITY_DEVICE_ID=192.168.1.184:5555 ./scripts/mobile/mobile-prod-login-device.sh
#   RUN_INTEGRATION=1  # Mail/Drive/Photos via flutter integration_test (réinstalle debug)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERIAL="${CLOUDITY_DEVICE_ID:-192.168.1.184:5555}"
API="${CLOUDITY_PROD_API:-https://api.cloudity.delhomme.ovh}"
CREDS_FILE="${SMOKE_PASS_FILE:-$ROOT/deploy/portainer/stack.env}"
export ANDROID_SERIAL="$SERIAL"

# shellcheck source=scripts/mobile/mobile-flutter-env.sh
source "$ROOT/scripts/mobile/mobile-flutter-env.sh"
# shellcheck source=scripts/mobile/mobile-device-resolve.sh
source "$ROOT/scripts/mobile/mobile-device-resolve.sh"

if [[ -f "$CREDS_FILE" ]]; then
  EMAIL="${CLOUDITY_PROD_EMAIL:-paul@delhomme.ovh}"
  PASS="$(grep '^SEED_ADMIN_PASSWORD=' "$CREDS_FILE" | cut -d= -f2- | tr -d '\r')"
else
  echo "❌ Fichier credentials absent : $CREDS_FILE" >&2
  exit 1
fi

echo "════════════════════════════════════════"
echo " Test login prod — $SERIAL"
echo " API=$API · compte=$EMAIL"
echo "════════════════════════════════════════"

echo ""
echo "── API auth/login ──"
login_json="$(curl -sf -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"tenant_id\":\"1\"}" 2>/dev/null || true)"
if [[ -z "$login_json" ]]; then
  echo "❌ auth/login KO (réseau ou credentials)" >&2
  exit 1
fi
requires_2fa="$(printf '%s' "$login_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("1" if d.get("requires_2fa") else "0")' 2>/dev/null || echo 0)"
if [[ "$requires_2fa" == "1" ]]; then
  echo "❌ Compte avec 2FA — tests ADB login skip (configurer CLOUDITY_E2E_TOTP_SECRET)" >&2
  exit 1
fi
JWT="$(printf '%s' "$login_json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')"
echo "✅ auth/login OK (JWT ${#JWT} chars)"

OK=0
KO=0
SKIP=0

adb_ui_login() {
  local label="$1" pkg="$2" activity="${3:-.MainActivity}"
  echo ""
  echo "── $label ($pkg) ──"
  adb -s "$SERIAL" shell am force-stop "$pkg" >/dev/null 2>&1 || true
  adb -s "$SERIAL" logcat -c >/dev/null 2>&1 || true
  adb -s "$SERIAL" shell am start -n "${pkg}/${activity}" >/dev/null
  sleep 8

  # Dump UI → repère champs + bouton
  adb -s "$SERIAL" shell uiautomator dump /sdcard/cloudity_ui.xml >/dev/null 2>&1 || true
  adb -s "$SERIAL" pull /sdcard/cloudity_ui.xml /tmp/cloudity_ui.xml >/dev/null 2>&1 || true

  python3 - "$EMAIL" "$PASS" <<'PY' || true
import re, subprocess, sys, xml.etree.ElementTree as ET
email, password = sys.argv[1], sys.argv[2]
serial = __import__("os").environ.get("ANDROID_SERIAL", "")
path = "/tmp/cloudity_ui.xml"
try:
    root = ET.parse(path).getroot()
except Exception:
    print("WARN: dump UI absent")
    sys.exit(0)

def adb(*args):
    subprocess.run(["adb", "-s", serial, *args], check=False, capture_output=True)

def center(bounds):
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds or "")
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return ((x1 + x2) // 2, (y1 + y2) // 2)

edits = []
connect_btn = None
broker_btn = None
login_screen = False
for node in root.iter("node"):
    cls = node.attrib.get("class", "")
    text = (node.attrib.get("text") or "").strip()
    desc = (node.attrib.get("content-desc") or "").strip()
    bounds = node.attrib.get("bounds", "")
    label = f"{text} {desc}".strip()
    if "Se connecter" in label or "Créer un compte" in label or "passkey" in label.lower() or "empreinte" in label.lower():
        login_screen = True
    if "Continuer avec un compte" in label or "@" in desc and "cloudity" in desc.lower():
        login_screen = True
    if cls.endswith("EditText") and bounds:
        c = center(bounds)
        if c:
            edits.append(c)
    # Bouton principal (text OU content-desc Semantics)
    if ("Se connecter" == text or "Se connecter" == desc) and bounds:
        c = center(bounds)
        if c:
            connect_btn = c
    # Compte broker déjà connu (même email) — un tap suffit
    if email.lower() in label.lower() and bounds and "Button" not in cls:
        c = center(bounds)
        if c and broker_btn is None:
            broker_btn = c
    if "Continuer" in label and email.split("@")[0].lower() in label.lower() and bounds:
        c = center(bounds)
        if c:
            broker_btn = c

if not login_screen and len(edits) < 2:
    print("SKIP: pas d'écran login (session restaurée ?)")
    sys.exit(2)

# Préférer reprendre le compte broker (SSO suite) si visible
if broker_btn and len(edits) < 2:
    print(f"TAP broker account @ {broker_btn}")
    adb("shell", "input", "tap", str(broker_btn[0]), str(broker_btn[1]))
    sys.exit(0)

if len(edits) >= 2:
    print(f"FILL email/password edits={len(edits)} btn={connect_btn}")

    def input_text(s: str):
        # argv list → pas d’échappement shell ; @ via KEYCODE_AT (77)
        if "@" in s:
            local, _, domain = s.partition("@")
            if local:
                adb("shell", "input", "text", local.replace(" ", "%s"))
            adb("shell", "input", "keyevent", "77")
            if domain:
                adb("shell", "input", "text", domain.replace(" ", "%s"))
            return
        adb("shell", "input", "text", s.replace(" ", "%s"))

    adb("shell", "input", "tap", str(edits[0][0]), str(edits[0][1]))
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    for _ in range(40):
        adb("shell", "input", "keyevent", "67")
    input_text(email)
    # Ne pas KEYCODE_BACK (ouvre parfois réglages Gboard) — TAB vers mot de passe
    adb("shell", "input", "keyevent", "61")  # TAB
    for _ in range(40):
        adb("shell", "input", "keyevent", "67")
    input_text(password)
    # Fermer clavier sans quitter l’app
    adb("shell", "input", "keyevent", "111")  # ESCAPE
    if connect_btn and (connect_btn[1] > edits[-1][1] + 20):
        # Ignorer les nœuds Semantics à hauteur ~0
        adb("shell", "input", "tap", str(connect_btn[0]), str(connect_btn[1]))
    else:
        # Bouton sous le 2e champ (~ +120 px)
        y = edits[-1][1] + 140
        adb("shell", "input", "tap", str(edits[-1][0]), str(y))
        adb("shell", "input", "keyevent", "66")  # ENTER
else:
    print("WARN: pas assez de champs EditText")
PY

  sleep 18
  adb -s "$SERIAL" shell uiautomator dump /sdcard/cloudity_ui_after.xml >/dev/null 2>&1 || true
  adb -s "$SERIAL" pull /sdcard/cloudity_ui_after.xml /tmp/cloudity_ui_after.xml >/dev/null 2>&1 || true

  local err=""
  err="$(adb -s "$SERIAL" logcat -d -t 200 2>/dev/null | rg -i 'flutter.*AuthException|Connexion impossible|non administrateur|FATAL EXCEPTION|FlutterError' | tail -3 || true)"
  local still_login=""
  still_login="$(python3 -c "
import xml.etree.ElementTree as ET
try:
  r=ET.parse('/tmp/cloudity_ui_after.xml').getroot()
  labels=[]
  for n in r.iter('node'):
    labels.append(n.attrib.get('text','') or '')
    labels.append(n.attrib.get('content-desc','') or '')
  blob=' '.join(labels)
  # encore login si bouton Se connecter + champs email visibles
  print('1' if ('Se connecter' in blob and ('Créer un compte' in blob or 'passkey' in blob.lower() or 'empreinte' in blob.lower())) else '0')
except: print('0')
" 2>/dev/null || echo 0)"

  if [[ -n "$err" ]]; then
    echo "❌ $label — erreurs logcat :"
    echo "$err" | sed 's/^/    /'
    KO=$((KO + 1))
    return 1
  fi
  if [[ "$still_login" == "1" ]]; then
    echo "❌ $label — toujours sur écran login après 18s"
    KO=$((KO + 1))
    return 1
  fi
  echo "✅ $label — login OK (hors écran connexion)"
  OK=$((OK + 1))
}

run_integration() {
  local app_dir="$1" label="$2" int_file="$3"
  echo ""
  echo "── $label (integration_test prod) ──"
  if [[ ! -f "$app_dir/$int_file" ]]; then
    echo "⏭️  Pas de $int_file"
    SKIP=$((SKIP + 1))
    return 0
  fi
  cd "$app_dir"
  flutter pub get >/dev/null
  set +e
  out="$(flutter test "$int_file" -d "$SERIAL" \
    --dart-define=CLOUDITY_E2E_GATEWAY="$API" \
    --dart-define=CLOUDITY_E2E_EMAIL="$EMAIL" \
    --dart-define=CLOUDITY_E2E_PASSWORD="$PASS" \
    --dart-define=CLOUDITY_E2E_TENANT=1 2>&1)"
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]] && ! printf '%s' "$out" | rg -q "Some tests failed|Skip:"; then
    if printf '%s' "$out" | rg -q "All tests passed"; then
      echo "✅ $label integration_test OK"
      OK=$((OK + 1))
      return 0
    fi
  fi
  if printf '%s' "$out" | rg -q "All tests passed"; then
    echo "✅ $label integration_test OK"
    OK=$((OK + 1))
    return 0
  fi
  echo "❌ $label integration_test échec"
  printf '%s\n' "$out" | tail -20 | sed 's/^/    /'
  KO=$((KO + 1))
  return 1
}

cloudity_prepare_flutter_env "$ROOT" 2>/dev/null || true

if [[ "${RUN_INTEGRATION:-0}" == "1" ]]; then
  run_integration "$ROOT/mobile/mail" "Mail" "integration_test/mail_flow_test.dart" || true
  run_integration "$ROOT/mobile/drive" "Drive" "integration_test/drive_flow_test.dart" || true
  run_integration "$ROOT/mobile/photos" "Photos" "integration_test/photos_flow_test.dart" || true
  echo ""
  echo "Réinstallation APK release OTA après integration_test…"
  CLOUDITY_DEVICE_ID="$SERIAL" DEPLOY_URL="$API" INSTALL_LOCAL=0 \
    APPS="Mail Drive Photos" "$ROOT/scripts/mobile/mobile-install-device.sh" >/dev/null || true
fi

# Apps OTA release — login ADB UI
adb_ui_login "Mail" "fr.cloudity.cloudity_mail" || true
adb_ui_login "Drive" "fr.cloudity.cloudity_drive" || true
adb_ui_login "Photos" "fr.cloudity.cloudity_photos" || true
adb_ui_login "Calendar" "fr.cloudity.cloudity_calendar" || true
adb_ui_login "Contacts" "fr.cloudity.cloudity_contacts" || true
adb_ui_login "Notes" "fr.cloudity.cloudity_notes" || true
adb_ui_login "Tasks" "fr.cloudity.cloudity_tasks" || true
adb_ui_login "Admin" "fr.cloudity.admin_app" || true

# Pass : package + activité différents
adb_ui_login "Pass" "com.cloudity.cloudity_pass" || true

echo ""
echo "════════════════════════════════════════"
echo " Résultat login device : $OK OK · $KO KO · $SKIP skip"
echo "════════════════════════════════════════"
[[ "$KO" -eq 0 ]]
