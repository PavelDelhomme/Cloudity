#!/usr/bin/env node
/**
 * Génère un code TOTP RFC 6238 (6 chiffres, SHA-1, période 30s) pour scripts E2E / mobile.
 * Usage : node scripts/dev/generate-totp.mjs <secret_base32>
 */
import crypto from 'node:crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(secret) {
  const cleaned = secret.replace(/[\s=]/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function hotp(key, counter, digits = 6) {
  const buf = Buffer.alloc(8)
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff
    counter = Math.floor(counter / 256)
  }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  const otp = (bin % 10 ** digits).toString().padStart(digits, '0')
  return otp
}

const secret = process.argv[2]
if (!secret) {
  console.error('Usage: generate-totp.mjs <secret_base32>')
  process.exit(1)
}
const key = base32Decode(secret)
if (key.length === 0) {
  console.error('Secret TOTP invalide')
  process.exit(1)
}
const counter = Math.floor(Date.now() / 1000 / 30)
process.stdout.write(hotp(key, counter))
