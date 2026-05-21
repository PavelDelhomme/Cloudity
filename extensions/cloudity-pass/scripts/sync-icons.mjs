/**
 * Copie des icônes placeholder depuis mobile/photos (PNG déjà dans le dépôt).
 * Remplace le warning build « icons/ manquant ».
 */

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(__dirname, '..');
const repoRoot = resolve(extRoot, '../..');
const iconsDir = join(extRoot, 'icons');
const source = join(repoRoot, 'mobile/photos/web/icons/Icon-192.png');

const sizes = [
  ['icon-16.png', 16],
  ['icon-32.png', 32],
  ['icon-48.png', 48],
  ['icon-128.png', 128],
];

async function main() {
  await stat(source);
  await mkdir(iconsDir, { recursive: true });
  for (const [name] of sizes) {
    await copyFile(source, join(iconsDir, name));
  }
  console.log(`[icons] ${sizes.length} fichiers → ${iconsDir}/ (source Icon-192.png)`);
}

main().catch((err) => {
  console.error('[icons]', err.message);
  process.exit(1);
});
