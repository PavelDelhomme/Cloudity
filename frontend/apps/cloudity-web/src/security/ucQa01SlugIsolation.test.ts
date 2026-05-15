/**
 * UC-QA-01 — garde-fous statiques : les modules API « métier » courants ne
 * doivent pas dépendre du slug rotatif `/app/settings/sec/` (réservé au
 * shell Settings + validation HMAC dédiée).
 *
 * Ce n’est pas une preuve runtime complète (E2E / audit manuel restent utiles)
 * mais évite une régression grossière (import de useSecurePaths dans api.ts).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8')
}

const FORBIDDEN = ['/app/settings/sec/', 'settings/sec/']

describe('UC-QA-01 — isolation slug Settings vs API métier', () => {
  it('api.ts ne référence pas le chemin slug rotatif SPA', () => {
    const src = read('api.ts')
    for (const frag of FORBIDDEN) {
      expect(src, `api.ts ne doit pas contenir "${frag}"`).not.toContain(frag)
    }
  })

  it('api.ts n’importe pas le hook useSecurePaths (réservé au dossier settings)', () => {
    const api = read('api.ts')
    expect(api).not.toMatch(/useSecurePaths/)
  })
})
