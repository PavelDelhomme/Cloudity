/**
 * Content script — détection passive des champs login sur les pages
 * visitées + ping d'activité au background.
 *
 * **Squelette** : ne fait pas (encore) d'autofill réel — ce serait MP-06.
 * On se contente de :
 *   1. détecter `input[type="password"]` et `autocomplete="username"` ;
 *   2. afficher un *badge* discret en bord d'input quand le coffre est
 *      déverrouillé pour signaler à l'utilisateur que Cloudity peut
 *      proposer un identifiant ;
 *   3. envoyer un `ping` au background à chaque interaction utilisateur
 *      pour repousser l'auto-lock 5 min.
 *
 * **Limites volontaires** :
 *   - aucun champ n'est rempli automatiquement (consent UX requis) ;
 *   - aucune donnée du coffre n'est stockée dans le DOM ;
 *   - aucune donnée n'est envoyée au site visité (le cipher reste dans
 *     le service worker / popup).
 */

export {};

const BADGE_CLASS = 'cloudity-pass-badge';
const BADGE_ATTR = 'data-cloudity-pass';

interface BackgroundResponse {
  ok?: boolean;
  unlocked?: boolean;
  error?: string;
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

function decorate(input: HTMLInputElement): void {
  if (input.dataset.cloudityPass === '1') return;
  input.dataset.cloudityPass = '1';
  input.setAttribute(BADGE_ATTR, '1');

  const badge = document.createElement('span');
  badge.className = BADGE_CLASS;
  badge.textContent = '🔐 Cloudity';
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
    'pointer-events:none',
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
