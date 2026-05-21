/**
 * Content script — détection passive des champs login sur les pages
 * visitées + ping d'activité au background.
 *
 * MP-06 : l'autofill reste strictement déclenché par clic utilisateur.
 * Le content script :
 *   1. détecter `input[type="password"]` et `autocomplete="username"` ;
 *   2. afficher un *badge* discret en bord d'input quand le coffre est
 *      déverrouillé pour signaler à l'utilisateur que Cloudity peut
 *      proposer un identifiant ;
 *   3. envoyer un `ping` au background à chaque interaction utilisateur
 *      pour repousser l'auto-lock 5 min.
 *
 * **Limites volontaires** :
 *   - aucun champ n'est rempli automatiquement avant clic ;
 *   - aucune donnée du coffre n'est stockée dans le DOM ;
 *   - aucune donnée n'est envoyée au site visité (le cipher reste dans
 *     le service worker / popup).
 */

export {};

import { hostCandidatesFromUrl } from '../shared/domainMatcher';

const BADGE_CLASS = 'cloudity-pass-badge';
const BADGE_ATTR = 'data-cloudity-pass';
const MENU_CLASS = 'cloudity-pass-menu';

interface BackgroundResponse {
  ok?: boolean;
  unlocked?: boolean;
  error?: string;
}

interface AutofillCandidate {
  id: number;
  vaultName: string;
  title: string;
  url: string;
  username: string;
  password: string;
}

async function pingBackground(): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind: 'ping' }, (resp: BackgroundResponse) => {
      resolve(resp ?? { ok: false, error: 'no_response' });
    });
  });
}

async function getStatus(): Promise<{ unlocked: boolean }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind: 'status' }, (resp: { unlocked?: boolean }) => {
      resolve({ unlocked: !!(resp && resp.unlocked) });
    });
  });
}

function isLoginInput(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.type === 'password') return true;
  const ac = (el.autocomplete ?? '').toLowerCase();
  if (ac.includes('username') || ac.includes('email')) return true;
  if (el.type === 'email') return true;
  return false;
}

function dispatchInputEvents(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function findLoginFields(anchor: HTMLInputElement): {
  username?: HTMLInputElement;
  password?: HTMLInputElement;
} {
  const root = anchor.closest('form') ?? document;
  const inputs = Array.from(root.querySelectorAll('input')).filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement && !el.disabled && !el.readOnly,
  );
  const passwords = inputs.filter((el) => el.type === 'password');
  const usernames = inputs.filter((el) => {
    const ac = (el.autocomplete ?? '').toLowerCase();
    return el.type === 'email' || ac.includes('username') || ac.includes('email') || /mail|user|login/i.test(el.name + el.id);
  });
  return {
    username: usernames[0],
    password: passwords[0] ?? (anchor.type === 'password' ? anchor : undefined),
  };
}

function fillCandidate(anchor: HTMLInputElement, candidate: AutofillCandidate): void {
  const fields = findLoginFields(anchor);
  if (fields.username && candidate.username) {
    fields.username.focus();
    fields.username.value = candidate.username;
    dispatchInputEvents(fields.username);
  }
  if (fields.password) {
    fields.password.focus();
    fields.password.value = candidate.password;
    dispatchInputEvents(fields.password);
  }
  void pingBackground();
}

async function listCandidates(): Promise<AutofillCandidate[]> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { kind: 'list-candidates', pageUrl: window.location.href },
      (resp: { ok?: boolean; candidates?: AutofillCandidate[]; error?: string }) => {
        if (!resp?.ok || !Array.isArray(resp.candidates)) {
          resolve([]);
          return;
        }
        resolve(resp.candidates);
      },
    );
  });
}

function closeMenus(): void {
  document.querySelectorAll(`.${MENU_CLASS}`).forEach((el) => el.remove());
}

async function showCandidateMenu(anchor: HTMLInputElement, badge: HTMLElement): Promise<void> {
  closeMenus();
  const menu = document.createElement('div');
  menu.className = MENU_CLASS;
  menu.style.cssText = [
    'position:absolute',
    'right:0',
    'top:calc(100% + 4px)',
    'min-width:220px',
    'max-width:300px',
    'background:#fff',
    'color:#111827',
    'border:1px solid #cbd5e1',
    'border-radius:8px',
    'box-shadow:0 8px 24px rgba(15,23,42,.18)',
    'font:12px system-ui,sans-serif',
    'padding:6px',
    'z-index:2147483647',
  ].join(';');
  menu.textContent = 'Recherche Cloudity…';
  badge.parentElement?.appendChild(menu);

  const candidates = await listCandidates();
  menu.textContent = '';
  if (candidates.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'Aucune entrée Cloudity pour ce domaine.';
    empty.style.cssText = 'padding:8px;color:#475569';
    menu.appendChild(empty);
    return;
  }

  for (const candidate of candidates) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = [
      'display:block',
      'width:100%',
      'text-align:left',
      'border:0',
      'background:transparent',
      'color:inherit',
      'padding:7px 8px',
      'border-radius:6px',
      'cursor:pointer',
      'font:inherit',
    ].join(';');
    btn.innerHTML = `<strong>${escapeHtml(candidate.title)}</strong><br><span>${escapeHtml(candidate.username || candidate.vaultName)}</span>`;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#eef2ff';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      fillCandidate(anchor, candidate);
      closeMenus();
    });
    menu.appendChild(btn);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c] ?? c);
}

function decorate(input: HTMLInputElement): void {
  if (input.dataset.cloudityPass === '1') return;
  input.dataset.cloudityPass = '1';
  input.setAttribute(BADGE_ATTR, '1');

  const badge = document.createElement('span');
  badge.className = BADGE_CLASS;
  const candidates = hostCandidatesFromUrl(window.location.href);
  badge.textContent = 'Cloudity';
  badge.title = candidates.length > 0
    ? `Cloudity Pass — domaine détecté : ${candidates.join(', ')}`
    : 'Cloudity Pass — domaine non détecté';
  badge.style.cssText = [
    'position:absolute',
    'right:6px',
    'top:50%',
    'transform:translateY(-50%)',
    'font:11px system-ui,sans-serif',
    'color:#fff',
    'background:#3a3aff',
    'padding:2px 6px',
    'border-radius:4px',
    'pointer-events:auto',
    'cursor:pointer',
    'opacity:0.85',
    'z-index:2147483647',
  ].join(';');

  const parent = input.parentElement;
  if (!parent) return;
  const computedPos = window.getComputedStyle(parent).position;
  if (computedPos === 'static') {
    parent.style.position = 'relative';
  }
  parent.appendChild(badge);

  badge.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  badge.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void showCandidateMenu(input, badge);
  });

  input.addEventListener('focus', () => {
    void pingBackground();
  });
  input.addEventListener('input', () => {
    void pingBackground();
  });
}

async function scan(): Promise<void> {
  const status = await getStatus();
  if (!status.unlocked) return;
  document.querySelectorAll('input').forEach((el) => {
    if (isLoginInput(el)) decorate(el as HTMLInputElement);
  });
}

const observer = new MutationObserver(() => {
  void scan();
});

void scan().then(() => {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest(`.${MENU_CLASS}, .${BADGE_CLASS}`)) return;
  closeMenus();
});

function findFillAnchor(): HTMLInputElement | null {
  const password = document.querySelector('input[type="password"]');
  if (password instanceof HTMLInputElement && !password.disabled && !password.readOnly) {
    return password;
  }
  const loginish = document.querySelector(
    'input[type="email"], input[autocomplete="username"], input[autocomplete="email"]',
  );
  if (loginish instanceof HTMLInputElement && !loginish.disabled && !loginish.readOnly) {
    return loginish;
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || (msg as { kind?: string }).kind !== 'fill-login') {
    return false;
  }
  const candidate = (msg as { candidate?: AutofillCandidate }).candidate;
  if (!candidate?.password) {
    sendResponse({ ok: false, error: 'candidate_missing' });
    return true;
  }
  const anchor = findFillAnchor();
  if (!anchor) {
    sendResponse({ ok: false, error: 'no_login_form' });
    return true;
  }
  fillCandidate(anchor, candidate);
  sendResponse({ ok: true });
  return true;
});
