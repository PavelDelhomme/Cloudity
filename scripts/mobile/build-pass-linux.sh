#!/usr/bin/env bash
# Build release Linux desktop pour Cloudity Pass (AppImage-ready bundle + .desktop).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="${ROOT}/mobile/pass"
OUT_DIR="${ROOT}/dist/linux-pass"
APP_ID="cloudity-pass"
APP_NAME="Cloudity Pass"

# shellcheck source=mobile-flutter-env.sh
source "${ROOT}/scripts/mobile/mobile-flutter-env.sh"
cloudity_prepare_flutter_env "$ROOT"

echo "🖥️  Build Linux Pass — flutter pub get"
(cd "$APP_DIR" && flutter pub get)

echo "🖥️  Build Linux Pass — flutter build linux --release"
(cd "$APP_DIR" && flutter build linux --release)

BUNDLE="${APP_DIR}/build/linux/x64/release/bundle"
if [[ ! -d "$BUNDLE" ]]; then
  echo "❌ Bundle introuvable : $BUNDLE"
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -a "$BUNDLE/." "$OUT_DIR/"

DESKTOP="${OUT_DIR}/${APP_ID}.desktop"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Gestionnaire de mots de passe Cloudity (E2E)
Exec=${OUT_DIR}/cloudity_pass
Icon=${OUT_DIR}/data/flutter_assets/assets/icon.png
Terminal=false
Categories=Utility;Security;
StartupWMClass=cloudity_pass
EOF

chmod +x "${OUT_DIR}/cloudity_pass" 2>/dev/null || true

cat > "${OUT_DIR}/README.txt" <<EOF
Cloudity Pass — build Linux desktop
===================================

Lancer :
  ${OUT_DIR}/cloudity_pass

Gateway (optionnel) :
  export CLOUDITY_GATEWAY_URL=https://votre-gateway:6002
  ./cloudity_pass

Installation menu :
  cp ${APP_ID}.desktop ~/.local/share/applications/

AppImage / Flatpak : voir docs/operations/DISTRIBUTION-LINUX-DESKTOP.md
EOF

echo "✅ Linux Pass release → ${OUT_DIR}"
echo "   Exécutable : ${OUT_DIR}/cloudity_pass"
