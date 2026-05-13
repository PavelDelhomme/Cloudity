#!/usr/bin/env node
/**
 * Bench Argon2id — calibration des profils device de Cloudity Pass.
 *
 * Référence : docs/securite/PASS-CRYPTO.md § 3.3.
 *
 * Mesure le temps de dérivation (mot de passe maître → MK 32 octets) pour
 * les 3 profils livrés (`desktop`, `mobile-high`, `mobile-low`) plus le
 * profil `test` (volontairement minuscule pour la CI).
 *
 * Usage :
 *   node scripts/bench-argon2.mjs              (3 itérations par profil)
 *   ITERATIONS=5 node scripts/bench-argon2.mjs (5 itérations)
 *   PROFILES=desktop,mobile-low ...            (sous-ensemble de profils)
 *
 * Cible :
 *   desktop      ~1000 ms (laptop modeste 2024+)
 *   mobile-high  ~500-700 ms (smartphone milieu de gamme 2024+)
 *   mobile-low   ~300-500 ms (smartphone bas de gamme / vieux)
 *
 * Si les chiffres réels diffèrent fortement de la cible, on ajuste les
 * paramètres (`m`, `t`) dans `src/argon2.ts` ARGON2ID_PROFILES — un upgrade
 * silencieux est préférable au downgrade (cf. PASS-CRYPTO § 3.3 dernière
 * note).
 */

import { argon2id } from 'hash-wasm'

const PROFILES = {
  test: { t: 1, m: 8, p: 1 },
  desktop: { t: 4, m: 262144, p: 4 },
  'mobile-high': { t: 3, m: 131072, p: 2 },
  'mobile-low': { t: 3, m: 65536, p: 2 },
}

const TARGET_MS = {
  test: 100,
  desktop: 1000,
  'mobile-high': 600,
  'mobile-low': 400,
}

const SALT = new Uint8Array(16).fill(0x42) // valeur stable, ne sert qu'au bench
const PASSWORD = 'cloudity-bench-master-password'

const requested =
  (process.env.PROFILES && process.env.PROFILES.split(',').map((s) => s.trim()).filter(Boolean)) ||
  Object.keys(PROFILES)
const iterations = Math.max(1, Number.parseInt(process.env.ITERATIONS ?? '3', 10) || 3)

function fmt(ms) {
  return `${ms.toFixed(1).padStart(7, ' ')} ms`
}

function pctDelta(actual, target) {
  const d = ((actual - target) / target) * 100
  const sign = d >= 0 ? '+' : ''
  return `${sign}${d.toFixed(0)}%`
}

console.log(`Bench Argon2id — ${iterations} itération(s) par profil\n`)
console.log('| profil       |     min |     med |     max |   cible | écart cible |')
console.log('|--------------|---------|---------|---------|---------|-------------|')

for (const profile of requested) {
  const params = PROFILES[profile]
  if (!params) {
    console.warn(`profil inconnu : ${profile}`)
    continue
  }
  const samples = []
  // 1 warmup hors stats (compilation WASM, page faults).
  await argon2id({
    password: PASSWORD,
    salt: SALT,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: 32,
    outputType: 'binary',
  })

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint()
    await argon2id({
      password: PASSWORD,
      salt: SALT,
      parallelism: params.p,
      iterations: params.t,
      memorySize: params.m,
      hashLength: 32,
      outputType: 'binary',
    })
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000
    samples.push(elapsedMs)
  }
  samples.sort((a, b) => a - b)
  const min = samples[0]
  const med = samples[Math.floor(samples.length / 2)]
  const max = samples[samples.length - 1]
  const target = TARGET_MS[profile]

  console.log(
    `| ${profile.padEnd(12)} | ${fmt(min)} | ${fmt(med)} | ${fmt(max)} | ${fmt(target)} | ${pctDelta(med, target).padStart(11)} |`
  )
}

console.log('\nNotes :')
console.log(' - Ces mesures dépendent fortement du CPU / cache du device.')
console.log(' - Si "desktop" tombe sous 500 ms, on peut bumper t=4 → t=6 sans gêner les utilisateurs.')
console.log(' - Si "mobile-low" dépasse 1500 ms, on rabaisse m=65536 → m=32768 (au prix de la sécurité).')
console.log(' - Spec normative : docs/securite/PASS-CRYPTO.md § 3.3.')
