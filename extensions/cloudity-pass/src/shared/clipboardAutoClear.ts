import { loadCachedUserPreferences, type PassPreferences } from './userPreferences';

let clearTimer: ReturnType<typeof setTimeout> | undefined;

export async function copyWithAutoClear(
  value: string,
  opts?: { ttlMs?: number; prefs?: PassPreferences },
): Promise<void> {
  const prefs = opts?.prefs ?? (await loadCachedUserPreferences()).pass;
  if (!prefs.clipboardEnabled) {
    throw new Error('clipboard_disabled');
  }
  await navigator.clipboard.writeText(value);
  if (clearTimer) clearTimeout(clearTimer);
  const ttlMs = opts?.ttlMs ?? prefs.clipboardClearMs;
  if (ttlMs <= 0) return;
  clearTimer = setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === value) {
        await navigator.clipboard.writeText('');
      }
    } catch {
      /* permission */
    }
  }, ttlMs);
}
