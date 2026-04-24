#!/usr/bin/env bash
# Finalise une feature : git add -A, commit (si besoin), push branche actuelle,
# renommage local en feat/finish-<slug-dérivé-du-nom>, push nouvelle branche,
# suppression de l'ancienne branche sur origin (best effort).
#
# Usage :
#   make feature-finish MSG="Message de commit complet"
#   MSG="..." ./scripts/feature-finish.sh
#
# Variables optionnelles :
#   NO_RENAME=1     — ne pas renommer (commit + push sur la branche actuelle uniquement)
#   ALLOW_MAIN=1    — autoriser l'exécution sur main/master (déconseillé)

set -euo pipefail

MSG="${MSG:-}"
NO_RENAME="${NO_RENAME:-0}"
ALLOW_MAIN="${ALLOW_MAIN:-0}"

if [ -z "$MSG" ]; then
  echo "Usage : make feature-finish MSG=\"Votre message de commit\"" >&2
  echo "   ou : MSG=\"...\" $0" >&2
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Ce répertoire n'est pas un dépôt Git." >&2
  exit 1
fi

OLD=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [ -z "$OLD" ]; then
  echo "HEAD détaché : placez-vous sur une branche (ex. feat/…)." >&2
  exit 1
fi

if { [ "$OLD" = "main" ] || [ "$OLD" = "master" ]; } && [ "$ALLOW_MAIN" != "1" ]; then
  echo "Refus : ne pas utiliser feature-finish sur $OLD (créez une branche feat/* ou passez ALLOW_MAIN=1)." >&2
  exit 1
fi

git add -A

if git diff --staged --quiet; then
  # Rien en staging : soit rien du tout, soit déjà tout commité avec avance sur origin
  if git status -sb | grep -q '\[ahead '; then
    echo "→ Aucun nouveau fichier à indexer ; commits locaux déjà présents, pas de nouveau commit."
  else
    echo "Rien à committer (arbre de travail vide après git add -A)." >&2
    exit 1
  fi
else
  git commit -m "$MSG"
fi

# Pousse la branche courante sur origin sous le même nom (crée ou met à jour le suivi)
git push -u origin HEAD

if [ "$NO_RENAME" = "1" ]; then
  echo "✅ NO_RENAME=1 : push effectué sur « $OLD ». Pas de renommage."
  exit 0
fi

if [[ "$OLD" == feat/finish-* ]]; then
  echo "✅ Branche déjà « $OLD » (feat/finish-*). Push terminé, pas de second renommage."
  exit 0
fi

# Slug : enlever préfixes courants, remplacer / par -, ASCII safe
slug="$OLD"
slug="${slug#feat/}"
slug="${slug#fix/}"
slug="${slug#cursor/}"
slug="${slug//\//-}"
slug=$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')
slug=$(printf '%s' "$slug" | sed 's/[^a-z0-9._-]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')

NEW_BRANCH="feat/finish-${slug}"
if [ -z "$slug" ]; then
  echo "Impossible de dériver un nom de branche depuis « $OLD »." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$NEW_BRANCH"; then
  echo "La branche locale « $NEW_BRANCH » existe déjà. Renommage annulé." >&2
  exit 1
fi

if git ls-remote --heads origin "$NEW_BRANCH" | grep -q .; then
  echo "La branche distante origin/$NEW_BRANCH existe déjà. Choisissez un autre flux ou supprimez-la." >&2
  exit 1
fi

git branch -m "$NEW_BRANCH"
git push -u origin "$NEW_BRANCH"

if git ls-remote --heads origin "$OLD" | grep -q .; then
  if git push origin --delete "$OLD"; then
    echo "→ Branche distante supprimée : origin/$OLD"
  else
    echo "⚠️  Impossible de supprimer origin/$OLD (protégée ou refus serveur). Supprimez-la à la main sur GitHub." >&2
  fi
else
  echo "→ Pas de branche distante origin/$OLD à supprimer."
fi

echo "✅ Branche actuelle : $NEW_BRANCH (état préservé, historique inchangé)."
