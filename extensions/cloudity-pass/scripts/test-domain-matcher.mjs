import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url);
const tmp = await mkdtemp(join(tmpdir(), 'cloudity-pass-domain-'));
const outfile = join(tmp, 'domainMatcher.mjs');

try {
  await build({
    entryPoints: [new URL('../src/shared/domainMatcher.ts', import.meta.url).pathname],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node20'],
    logLevel: 'silent',
  });

  const mod = await import(pathToFileURL(outfile).href);
  const {
    normalizeHost,
    registrableDomain,
    hostMatchesEntry,
    hostCandidatesFromUrl,
  } = mod;

  assert.equal(normalizeHost('https://www.Example.com/login?q=1'), 'example.com');
  assert.equal(normalizeHost('sub.example.com:443/path'), 'sub.example.com');
  assert.equal(registrableDomain('app.service.co.uk'), 'service.co.uk');
  assert.equal(registrableDomain('vault.example.com'), 'example.com');
  assert.equal(hostMatchesEntry('login.example.com', 'https://example.com'), true);
  assert.equal(hostMatchesEntry('evil-example.com', 'example.com'), false);
  assert.equal(hostMatchesEntry('shop.example.co.uk', 'example.co.uk'), true);
  assert.deepEqual(hostCandidatesFromUrl('https://login.example.com/a'), [
    'login.example.com',
    'example.com',
  ]);

  console.log(`[test] domainMatcher OK (${root.pathname})`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
