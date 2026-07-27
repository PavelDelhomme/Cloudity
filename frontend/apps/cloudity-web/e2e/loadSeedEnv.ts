import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ENV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env')

let cached: Record<string, string> | null = null

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  const out: Record<string, string> = {}
  for (const raw of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function dotEnv(): Record<string, string> {
  if (!cached) cached = parseEnvFile(REPO_ENV)
  return cached
}

export function seedAdminEmail(): string {
  return (
    process.env.PLAYWRIGHT_E2E_EMAIL ||
    dotEnv().SEED_ADMIN_EMAIL ||
    'admin@cloudity.local'
  )
}

export function seedAdminPassword(): string {
  const fromPlaywright = process.env.PLAYWRIGHT_E2E_PASSWORD
  if (fromPlaywright) return fromPlaywright
  const fromDotEnv = dotEnv().SEED_ADMIN_PASSWORD
  if (fromDotEnv) return fromDotEnv
  throw new Error(
    'Mot de passe seed manquant : définir SEED_ADMIN_PASSWORD dans .env (racine du dépôt) ou PLAYWRIGHT_E2E_PASSWORD',
  )
}
