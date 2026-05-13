/**
 * Build script de l'extension Cloudity Pass (MV3).
 *
 * Bundle 3 entrées vers `dist/` :
 *   - `background.js`  → service worker (vault state, auto-lock 5 min)
 *   - `content.js`     → content script (détection champs login, message
 *                        passing avec le background — autofill réel en MP-06)
 *   - `popup/popup.js` → UI popup (déverrouillage maître + suggestions)
 *
 * Copie aussi `manifest.json`, les icônes et les pages HTML/CSS statiques.
 *
 * Usage :
 *   node scripts/build.mjs           # build production minifié
 *   node scripts/build.mjs --watch   # rebuild incrémental (dev)
 */

import { build, context } from 'esbuild';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = {
  background: join(root, 'src/background/index.ts'),
  content: join(root, 'src/content/index.ts'),
  'popup/popup': join(root, 'src/popup/popup.ts'),
  'options/options': join(root, 'src/options/options.ts'),
};

async function copyStatic() {
  await mkdir(dist, { recursive: true });
  await copyFile(join(root, 'manifest.json'), join(dist, 'manifest.json'));
  await copyDir(join(root, 'src/popup/static'), join(dist, 'popup'));
  await copyDir(join(root, 'src/options/static'), join(dist, 'options'));
  await copyDir(join(root, 'icons'), join(dist, 'icons')).catch(() => {
    console.warn(
      '[build] dossier icons/ manquant — squelette livré sans icônes.\n' +
      '         Ajoute des PNG 16/32/48/128 dans extensions/cloudity-pass/icons/.',
    );
  });
}

async function copyDir(src, dst) {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dst, { recursive: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else if (entry.isFile()) await copyFile(s, d);
  }
}

async function fileExistsSafe(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  for (const [name, file] of Object.entries(entryPoints)) {
    if (!(await fileExistsSafe(file))) {
      console.warn(`[build] entrée introuvable, ignorée : ${relative(root, file)}`);
      delete entryPoints[name];
    }
  }
  const opts = {
    entryPoints,
    outdir: dist,
    bundle: true,
    target: ['chrome120', 'firefox128', 'edge120'],
    format: 'esm',
    platform: 'browser',
    sourcemap: !watch ? false : 'inline',
    minify: !watch,
    logLevel: 'info',
    treeShaking: true,
    define: {
      'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
    },
  };
  await copyStatic();
  if (watch) {
    const ctx = await context(opts);
    await ctx.watch();
    console.log('[build] watch mode actif — Ctrl+C pour quitter.');
  } else {
    await build(opts);
    console.log(`[build] OK → ${relative(process.cwd(), dist)}/`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
