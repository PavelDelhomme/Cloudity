/**
 * Build Firefox : réutilise le bundle Chrome puis applique manifest Gecko.
 *
 * Prérequis : `npm run build` dans `extensions/cloudity-pass/`.
 */

import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const chromeRoot = resolve(root, '../cloudity-pass');
const chromeDist = join(chromeRoot, 'dist');
const dist = join(root, 'dist');

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
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

function runNpmBuild(dir) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: dir,
      stdio: 'inherit',
      shell: true,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm run build exit ${code}`))));
  });
}

async function main() {
  if (!(await fileExists(join(chromeRoot, 'package.json')))) {
    throw new Error('extensions/cloudity-pass introuvable');
  }
  console.log('[firefox] build Chrome source…');
  await runNpmBuild(chromeRoot);

  if (!(await fileExists(chromeDist))) {
    throw new Error('dist Chrome manquant après build');
  }

  await mkdir(dist, { recursive: true });
  await copyDir(chromeDist, dist);

  const chromeManifest = JSON.parse(await readFile(join(chromeDist, 'manifest.json'), 'utf8'));
  const firefoxManifest = JSON.parse(
    await readFile(join(root, 'manifest.firefox.json'), 'utf8'),
  );

  const merged = {
    ...chromeManifest,
    ...firefoxManifest,
    version: chromeManifest.version ?? firefoxManifest.version,
    browser_specific_settings: firefoxManifest.browser_specific_settings,
  };
  delete merged.minimum_chrome_version;

  await writeFile(join(dist, 'manifest.json'), JSON.stringify(merged, null, 2) + '\n');
  console.log(`[firefox] OK → ${dist}/ (about:debugging → Charger extension temporaire)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
