/**
 * Domain matcher pour l'extension Pass (MP-06).
 *
 * Objectif : proposer une entrée uniquement si son URL appartient au site
 * courant ou à un domaine parent raisonnable. On reste volontairement strict :
 * pas de fuzzy matching, pas de catch-all, pas d'IP privée transformée.
 */

const COMMON_SECOND_LEVEL_TLDS = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'com.au',
  'net.au',
  'com.br',
  'com.mx',
  'co.jp',
  'co.kr',
  'com.tr',
]);

export function normalizeHost(input: string | null | undefined): string {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return stripWww(url.hostname.replace(/\.$/, ''));
  } catch {
    return stripWww(raw.split('/')[0].split(':')[0].replace(/\.$/, ''));
  }
}

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

export function registrableDomain(host: string): string {
  const h = normalizeHost(host);
  if (!h || h === 'localhost' || /^[0-9.]+$/.test(h) || h.includes(':')) return h;
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 2) return h;
  const lastTwo = parts.slice(-2).join('.');
  if (COMMON_SECOND_LEVEL_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function hostMatchesEntry(pageHost: string, entryUrlOrHost: string): boolean {
  const page = normalizeHost(pageHost);
  const entry = normalizeHost(entryUrlOrHost);
  if (!page || !entry) return false;
  if (page === entry) return true;
  if (page.endsWith(`.${entry}`)) return true;
  return registrableDomain(page) === registrableDomain(entry);
}

export function hostCandidatesFromUrl(pageUrl: string): string[] {
  const host = normalizeHost(pageUrl);
  if (!host) return [];
  const reg = registrableDomain(host);
  return host === reg ? [host] : [host, reg];
}
