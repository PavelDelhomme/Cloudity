/**
 * Lance les tests DrivePage en boucle (par défaut 10 runs) et écrit un rapport.
 * Usage: node scripts/drive-test-loop.js [nombre de runs]
 * Sans bloquer le PC (runs séquentiels, pas de Docker).
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const runs = parseInt(process.argv[2] || process.env.RUNS || '10', 10)
const reportPath = path.join(__dirname, '..', 'test-results-drive-loop.json')

function runVitest() {
  return new Promise((resolve) => {
    const start = Date.now()
    const child = spawn(
      'npx',
      ['vitest', 'run', 'src/pages/app/DrivePage.test.tsx'],
      { cwd: path.join(__dirname, '..'), stdio: 'inherit' }
    )
    child.on('close', (code, signal) => {
      const exitCode = code != null ? code : (signal ? 1 : 0)
      resolve({ code: exitCode, durationMs: Date.now() - start })
    })
  })
}

async function main() {
  const results = []
  console.log(`Drive tests en boucle: ${runs} run(s)\n`)
  for (let i = 0; i < runs; i++) {
    process.stdout.write(`Run ${i + 1}/${runs}... `)
    const result = await runVitest()
    results.push({ run: i + 1, ...result, ok: Number(result.code) === 0 })
    console.log(result.ok ? `OK (${result.durationMs}ms)` : `FAIL (code ${result.code})`)
  }
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  fs.writeFileSync(reportPath, JSON.stringify({ runs, passed, failed, results }, null, 2))
  console.log(`\nRapport: ${reportPath}`)
  console.log(`Résumé: ${passed}/${runs} passés, ${failed} échoués`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
