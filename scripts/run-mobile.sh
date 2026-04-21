#!/usr/bin/env bash
# Lance une app Flutter mobile du monorepo Cloudity.
# Usage : make run-mobile APP=Admin
#         APP=Mail ./scripts/run-mobile.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_RAW="${APP:-${1:-}}"
if [[ -z "${APP_RAW}" ]]; then
  echo "Usage (exemples) :"
  echo "  make run-mobile APP=Admin"
  echo "  make run-mobile APP=Drive"
  echo "  make run-mobile APP=Mail"
  echo "  make run-mobile APP=Calendar"
  echo "  make run-mobile APP=Contacts"
  echo "  make run-mobile APP=Photos"
  echo "  make run-mobile APP=Pass"
  echo "Créez le dossier Flutter correspondant (voir docs/MOBILES.md) : p.ex. mobile/mail ou mobile/mail_app."
  exit 1
fi

NORM=$(echo "$APP_RAW" | tr '[:upper:]' '[:lower:]')

if ! command -v flutter >/dev/null 2>&1; then
  echo "❌ Flutter n’est pas installé ou pas dans le PATH."
  echo "   https://docs.flutter.dev/get-started/install"
  exit 1
fi

chmod +x "${ROOT}/scripts/check-flutter-sdk-writable.sh" 2>/dev/null || true
if ! "${ROOT}/scripts/check-flutter-sdk-writable.sh"; then
  exit 1
fi

# Premier dossier existant gagne (aligné sur Makefile init-mobile : mobile/mail, mobile/drive, …).
first_existing() {
  for d in "$@"; do
    if [[ -d "$d" ]]; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

case "$NORM" in
  admin)
    TARGET=$(first_existing "${ROOT}/mobile/admin_app" || true)
    ;;
  drive)
    TARGET=$(first_existing "${ROOT}/mobile/drive" "${ROOT}/mobile/drive_app" || true)
    ;;
  mail)
    TARGET=$(first_existing "${ROOT}/mobile/mail" "${ROOT}/mobile/mail_app" || true)
    ;;
  calendar)
    TARGET=$(first_existing "${ROOT}/mobile/calendar" "${ROOT}/mobile/calendar_app" || true)
    ;;
  contacts)
    TARGET=$(first_existing "${ROOT}/mobile/contacts" "${ROOT}/mobile/contacts_app" || true)
    ;;
  photos)
    TARGET=$(first_existing "${ROOT}/mobile/photos" "${ROOT}/mobile/photos_app" || true)
    ;;
  pass)
    TARGET=$(first_existing "${ROOT}/mobile/pass" "${ROOT}/mobile/pass_app" || true)
    ;;
  *)
    echo "❌ APP inconnu : ${APP_RAW}"
    echo "   Valeurs reconnues : Admin, Drive, Mail, Calendar, Contacts, Photos, Pass"
    exit 1
    ;;
esac

if [[ -z "${TARGET:-}" ]]; then
  echo "ℹ️  Aucun dossier Flutter dans le dépôt pour « ${APP_RAW} » — ce n’est pas une panne :"
  echo "    Projets présents : Photos, Drive, Mail, Admin (voir mobile/)."
  echo "    Pour une app absente (Calendar, …), créez par exemple :"
  case "$NORM" in
    admin) echo "      cd mobile && flutter create admin_app" ;;
    drive) echo "      cd mobile && flutter create drive   # le dépôt inclut déjà mobile/drive si vous avez pull la branche courante" ;;
    mail) echo "      cd mobile && flutter create mail" ;;
    calendar) echo "      cd mobile && flutter create calendar" ;;
    contacts) echo "      cd mobile && flutter create contacts" ;;
    photos) echo "      cd mobile && flutter create photos" ;;
    pass) echo "      cd mobile && flutter create pass" ;;
  esac
  echo "    (ou le suffixe _app : mobile/mail_app, etc.)"
  echo "    Puis : make run-mobile APP=${APP_RAW}"
  echo "    Documentation : docs/MOBILES.md, docs/SYNC-BACKLOG.md, docs/ROADMAP.md"
  exit 2
fi

if command -v adb >/dev/null 2>&1; then
  if adb devices 2>/dev/null | grep -q "unauthorized"; then
    echo "⚠️  ADB : au moins un appareil est « unauthorized »."
    echo "    Déverrouillez le téléphone et acceptez la clé RSA (débogage USB). Voir docs/MOBILES.md (USB / ADB)."
  fi
fi

cd "$TARGET"
echo "📱 flutter run dans ${TARGET}"

# Appareil : CLOUDITY_DEVICE_ID, ANDROID_SERIAL, ou premier périphérique « device » (adb).
DEVICE_ARGS=()
if [[ -n "${CLOUDITY_DEVICE_ID:-}" ]]; then
  DEVICE_ARGS=(-d "${CLOUDITY_DEVICE_ID}")
elif [[ -n "${ANDROID_SERIAL:-}" ]]; then
  DEVICE_ARGS=(-d "${ANDROID_SERIAL}")
elif command -v adb >/dev/null 2>&1; then
  SERIAL=$(adb devices 2>/dev/null | awk '/\tdevice$/ {print $1; exit}')
  if [[ -n "${SERIAL}" ]]; then
    echo "   → ADB : ${SERIAL}"
    DEVICE_ARGS=(-d "${SERIAL}")
  fi
fi

exec flutter run "${DEVICE_ARGS[@]}" "$@"
