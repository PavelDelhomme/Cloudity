#!/usr/bin/env bash
# Génère REPORT.md à partir d'un dossier benchmark (scenarios.jsonl + snapshots JSON).
set -euo pipefail

export LC_ALL=C
export LANG=C

DIR="${1:-}"
if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
  echo "Usage: $0 reports/perf/benchmark-<run-id>" >&2
  exit 1
fi

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Manque : $1" >&2; exit 1; }; }
require_cmd jq

REPORT="${DIR}/REPORT.md"
HOST="$(hostname)"
TS="$(date -Iseconds)"
RUN_ID="$(basename "$DIR")"

{
  echo "# Rapport performance Cloudity"
  echo ""
  echo "| | |"
  echo "|---|---|"
  echo "| **Run ID** | \`${RUN_ID}\` |"
  echo "| **Généré** | ${TS} |"
  echo "| **Hôte mesure** | ${HOST} (Docker cloudity-* uniquement) |"
  echo "| **Périmètre disque chiffré** | Clés applicatives conteneurs — **pas** LUKS PCFixe / VPS |"
  echo ""
  echo "## Résumé par scénario"
  echo ""
  echo "| ID | Scénario | Catégorie | Durée (s) | CPU Σ Δ | MEM Σ Δ (MiB) | Exit |"
  echo "|:--:|----------|-----------|----------:|--------:|--------------:|:----:|"
} > "$REPORT"

if [ -f "${DIR}/scenarios.jsonl" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    id=$(echo "$line" | jq -r '.id')
    name=$(echo "$line" | jq -r '.name')
    cat=$(echo "$line" | jq -r '.category')
    dur=$(echo "$line" | jq -r '.duration_s')
    ec=$(echo "$line" | jq -r '.exit_code')
    before=$(echo "$line" | jq -r '.before')
    after=$(echo "$line" | jq -r '.after')
    cpu_d="—"
    mem_d="—"
    if [ -f "$before" ] && [ -f "$after" ]; then
      cpu_b=$(jq '.totals.cpu_pct_sum // 0' "$before")
      cpu_a=$(jq '.totals.cpu_pct_sum // 0' "$after")
      mem_b=$(jq '.totals.memory_mib_sum // 0' "$before")
      mem_a=$(jq '.totals.memory_mib_sum // 0' "$after")
      cpu_d=$(awk -v a="$cpu_a" -v b="$cpu_b" 'BEGIN{printf "%+.1f", a-b}')
      mem_d=$(awk -v a="$mem_a" -v b="$mem_b" 'BEGIN{printf "%+.0f", a-b}')
    fi
    echo "| ${id} | ${name} | ${cat} | ${dur} | ${cpu_d} | ${mem_d} | ${ec} |" >> "$REPORT"
  done < "${DIR}/scenarios.jsonl"
fi

{
  echo ""
  echo "## Baseline vs final"
  echo ""
} >> "$REPORT"

if [ -f "${DIR}/00-baseline-idle.json" ] && [ -f "${DIR}/20-final-idle.json" ]; then
  jq -s '
    .[0] as $b | .[1] as $a |
    {
      baseline: {cpu_pct_sum: $b.totals.cpu_pct_sum, memory_mib_sum: $b.totals.memory_mib_sum, containers: $b.totals.container_count},
      final: {cpu_pct_sum: $a.totals.cpu_pct_sum, memory_mib_sum: $a.totals.memory_mib_sum, containers: $a.totals.container_count},
      delta: {
        cpu_pct_sum: ($a.totals.cpu_pct_sum - $b.totals.cpu_pct_sum),
        memory_mib_sum: ($a.totals.memory_mib_sum - $b.totals.memory_mib_sum)
      }
    }
  ' "${DIR}/00-baseline-idle.json" "${DIR}/20-final-idle.json" >> "${DIR}/baseline-final.json"

  b_cpu=$(jq '.baseline.cpu_pct_sum' "${DIR}/baseline-final.json")
  f_cpu=$(jq '.final.cpu_pct_sum' "${DIR}/baseline-final.json")
  b_mem=$(jq '.baseline.memory_mib_sum' "${DIR}/baseline-final.json")
  f_mem=$(jq '.final.memory_mib_sum' "${DIR}/baseline-final.json")
  d_cpu=$(jq '.delta.cpu_pct_sum' "${DIR}/baseline-final.json")
  d_mem=$(jq '.delta.memory_mib_sum' "${DIR}/baseline-final.json")

  {
    echo "| Métrique | Baseline | Final | Δ |"
    echo "|----------|--------:|------:|--:|"
    echo "| CPU Σ (%) | ${b_cpu} | ${f_cpu} | ${d_cpu} |"
    echo "| MEM Σ (MiB) | ${b_mem} | ${f_mem} | ${d_mem} |"
    echo ""
  } >> "$REPORT"
fi

{
  echo "## Top conteneurs (dernier snapshot final)"
  echo ""
} >> "$REPORT"

if [ -f "${DIR}/20-final-idle.json" ]; then
  echo "| Conteneur | CPU % | MEM (MiB) | NET I/O | BLOCK I/O |" >> "$REPORT"
  echo "|-----------|------:|----------:|---------|-----------|" >> "$REPORT"
  jq -r '.containers | sort_by(-.cpu_pct) | .[:8][] | "| \(.name) | \(.cpu_pct) | \(.memory_mib) | \(.net_io) | \(.block_io) |"' \
    "${DIR}/20-final-idle.json" >> "$REPORT" 2>/dev/null || true
  echo "" >> "$REPORT"
fi

{
  echo "## Recommandations frontend web"
  echo ""
  echo "- **Sync mail globale** : intervalle 18 s — éviter d'ouvrir plusieurs onglets Cloudity (doublons sync)."
  echo "- **Notifications** : chaque sync IMAP sollicite \`mail-directory-service\` + Postgres ; désactiver si non utilisé."
  echo "- **Pages lourdes** (Mail, Drive, Photos) : préférer la pagination et invalider les queries React Query avec parcimonie."
  echo "- **Mesure navigateur** : Chrome DevTools → Performance / Memory lors des parcours Playwright (\`make test-e2e-playwright\`)."
  echo ""
  echo "## Matrice produit (roadmap perf)"
  echo ""
  echo "Plateformes cibles futures (non toutes benchmarkées ici) :"
  echo ""
  echo "| App | Web | Android | Linux | Windows | macOS |"
  echo "|-----|:---:|:-------:|:-----:|:-------:|:-----:|"
  echo "| Office (Word/Excel/PPT) | 🟡 | ☐ | ☐ | ☐ | ☐ |"
  echo "| Mail | ✅ | 🟡 | ☐ | ☐ | ☐ |"
  echo "| Calendar | 🟡 | ☐ | ☐ | ☐ | ☐ |"
  echo "| Contacts | 🟡 | ☐ | ☐ | ☐ | ☐ |"
  echo "| Drive / Photos | ✅ | 🟡 | 🟡 | ☐ | ☐ |"
  echo ""
  echo "Légende : ✅ mesurable aujourd'hui · 🟡 partiel · ☐ à venir"
  echo ""
  echo "## Fichiers bruts"
  echo ""
  echo "\`\`\`"
  echo "ls -la ${DIR}/"
  echo "\`\`\`"
} >> "$REPORT"

echo "$REPORT"
