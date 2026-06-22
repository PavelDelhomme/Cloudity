#!/usr/bin/env bash
# Rapport d'avancement (STATUS / TODOS / BACKLOG) + envoi email optionnel.
# Usage : ./scripts/dev/send-progress-recap.sh
# Env (.env) :
#   PROGRESS_EMAIL_TO=you@example.com
#   PROGRESS_SMTP_HOST=smtp.example.com
#   PROGRESS_SMTP_PORT=587
#   PROGRESS_SMTP_USER=
#   PROGRESS_SMTP_PASSWORD=
#   PROGRESS_SMTP_FROM=cloudity@example.com

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true
  set +a
fi

OUT_DIR="reports/progress"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${OUT_DIR}/recap-${STAMP}.md"

extract_section() {
  local file="$1"
  local max_lines="${2:-80}"
  if [ ! -f "$file" ]; then
    echo "_Fichier \`${file}\` absent._"
    return
  fi
  head -n "$max_lines" "$file"
}

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
last_commit="$(git log -1 --oneline 2>/dev/null || echo '?')"

latest_test_report=""
if [ -d reports/test-logs ]; then
  if [ -x scripts/ci/test-logs-resolve-run.sh ]; then
    run_dir="$(./scripts/ci/test-logs-resolve-run.sh 2>/dev/null || true)"
    if [ -n "$run_dir" ] && [ -f "${run_dir}/REPORT.md" ]; then
      latest_test_report="${run_dir}/REPORT.md"
    fi
  fi
fi

{
  echo "# Cloudity — récap avancement"
  echo ""
  echo "- **Date** : $(date -Iseconds)"
  echo "- **Branche** : \`${branch}\`"
  echo "- **Dernier commit** : ${last_commit}"
  if [ -n "$latest_test_report" ]; then
    echo "- **Dernier rapport tests** : \`${latest_test_report}\`"
  fi
  echo ""

  echo "## STATUS.md (extrait)"
  echo ""
  extract_section STATUS.md 60
  echo ""

  echo "## TODOS.md (extrait)"
  echo ""
  extract_section TODOS.md 80
  echo ""

  echo "## BACKLOG.md (extrait)"
  echo ""
  extract_section BACKLOG.md 60
  echo ""

  echo "## Git — commits récents"
  echo ""
  echo '```'
  git log -8 --oneline 2>/dev/null || true
  echo '```'
  echo ""

  if [ -n "$latest_test_report" ]; then
    echo "## Derniers tests (extrait REPORT)"
    echo ""
    grep -E '^## |^\| |❌|✅' "$latest_test_report" 2>/dev/null | head -40 || true
  fi
} > "$OUT_FILE"

echo "📧 Récap écrit : $OUT_FILE"

TO="${PROGRESS_EMAIL_TO:-}"
if [ -z "$TO" ]; then
  echo "   (PROGRESS_EMAIL_TO non défini — pas d'envoi email)"
  exit 0
fi

HOST="${PROGRESS_SMTP_HOST:-}"
if [ -z "$HOST" ]; then
  echo "   PROGRESS_SMTP_HOST absent — récap fichier seulement."
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "   python3 requis pour l'envoi SMTP — récap fichier seulement."
  exit 0
fi

PORT="${PROGRESS_SMTP_PORT:-587}"
USER="${PROGRESS_SMTP_USER:-}"
PASS="${PROGRESS_SMTP_PASSWORD:-}"
FROM="${PROGRESS_SMTP_FROM:-${USER:-cloudity@localhost}}"
SUBJECT="Cloudity recap $(date +%Y-%m-%d) — ${branch}"

python3 - "$HOST" "$PORT" "$USER" "$PASS" "$FROM" "$TO" "$SUBJECT" "$OUT_FILE" <<'PY'
import smtplib, ssl, sys
from email.mime.text import MIMEText
from pathlib import Path

host, port_s, user, password, from_addr, to_addr, subject, body_path = sys.argv[1:9]
port = int(port_s)
body = Path(body_path).read_text(encoding="utf-8")
msg = MIMEText(body, "plain", "utf-8")
msg["Subject"] = subject
msg["From"] = from_addr
msg["To"] = to_addr

context = ssl.create_default_context()
with smtplib.SMTP(host, port, timeout=30) as smtp:
    smtp.ehlo()
    if smtp.has_extn("STARTTLS"):
        smtp.starttls(context=context)
        smtp.ehlo()
    if user:
        smtp.login(user, password)
    smtp.sendmail(from_addr, [to_addr], msg.as_string())
print(f"✅ Email envoyé à {to_addr}")
PY
