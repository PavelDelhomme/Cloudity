/**
 * Popup MV3 — connexion Cloudity puis initialisation / déverrouillage du coffre.
 * Aligné sur le hub web (`PassPage` / `UnlockScreen`) et `mobile/pass`.
 */

export {};

interface StatusResp {
  unlocked: boolean;
  lastActivityAt: number;
  autoLockMs: number;
  gatewayUrl?: string;
  authenticated: boolean;
  vaultEmpty: boolean | null;
  userIdStr?: string;
  sessionApiAvailable: boolean;
}

interface OkResp {
  ok: true;
}

interface ErrResp {
  ok: false;
  error: string;
}

type AnyResp = StatusResp | OkResp | ErrResp;

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`popup: élément manquant ${sel}`);
  return el;
};

function send(msg: unknown): Promise<AnyResp> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: AnyResp) => {
      resolve(resp ?? ({ ok: false, error: 'no_response' } as ErrResp));
    });
  });
}

let countdownTimer: number | undefined;

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stopCountdown(): void {
  if (countdownTimer !== undefined) {
    clearInterval(countdownTimer);
    countdownTimer = undefined;
  }
}

function startCountdown(deadline: number): void {
  stopCountdown();
  const tick = () => {
    const remaining = deadline - Date.now();
    ($('#lock-countdown') as HTMLElement).textContent = formatRemaining(remaining);
    if (remaining <= 0) {
      void refresh();
    }
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

function setVisible(el: HTMLElement, visible: boolean): void {
  el.hidden = !visible;
}

async function refresh(): Promise<void> {
  const resp = (await send({ kind: 'status' })) as StatusResp;
  const badge = $('#status-badge');
  const gatewayMissing = $('#gateway-missing');
  const sessionMissing = $('#session-missing');
  const locked = $('#locked-panel');
  const unlocked = $('#unlocked-panel');
  const sessionApiWarning = $('#session-api-warning');

  sessionApiWarning.hidden = resp.sessionApiAvailable !== false;
  if (!resp.sessionApiAvailable) {
    sessionApiWarning.textContent =
      'chrome.storage.session indisponible : mets à jour le navigateur (Chrome 114+) pour te connecter depuis l’extension.';
  }

  const hasGateway = !!(resp.gatewayUrl && resp.gatewayUrl.length > 0);
  gatewayMissing.hidden = hasGateway;

  if (resp.unlocked) {
    setVisible(sessionMissing, false);
    setVisible(locked, false);
    setVisible(unlocked, true);
    badge.textContent = 'État : coffre déverrouillé';
    if (resp.lastActivityAt > 0) {
      startCountdown(resp.lastActivityAt + resp.autoLockMs);
    }
    return;
  }

  stopCountdown();
  setVisible(unlocked, false);

  if (!hasGateway) {
    setVisible(sessionMissing, false);
    setVisible(locked, false);
    badge.textContent = 'État : gateway manquant';
    return;
  }

  if (!resp.authenticated) {
    setVisible(sessionMissing, true);
    setVisible(locked, false);
    badge.textContent = 'État : non connecté';
    return;
  }

  setVisible(sessionMissing, false);
  setVisible(locked, true);
  badge.textContent = 'État : connecté, coffre verrouillé';

  const parcours = $('#parcours-hint');
  const probeWarn = $('#probe-warning');
  const confirmLabel = $('#confirm-label') as HTMLLabelElement;
  const confirmInput = $('#master-password-confirm') as HTMLInputElement;
  const unlockBtn = $('#unlock-btn') as HTMLButtonElement;

  const isSetup = resp.vaultEmpty === true;
  if (resp.vaultEmpty === null) {
    probeWarn.textContent =
      'Impossible de vérifier la liste des coffres (réseau ou serveur). Le formulaire suppose un coffre déjà existant ; recharge après avoir vérifié le gateway.';
    probeWarn.hidden = false;
  } else {
    probeWarn.hidden = true;
  }

  if (isSetup) {
    parcours.innerHTML =
      '<strong>2. Initialiser le coffre</strong> — aucun coffre côté serveur. Choisis un mot de passe maître (≥ 8 car.) + confirmation. Cloudity ne le stocke pas.';
    confirmLabel.hidden = false;
    confirmInput.hidden = false;
    unlockBtn.textContent = 'Initialiser et continuer';
  } else {
    parcours.innerHTML =
      '<strong>2. Déverrouiller le coffre</strong> — saisis le même mot de passe maître que sur le hub web (profil Argon2id « Desktop » par défaut côté extension).';
    confirmLabel.hidden = true;
    confirmInput.hidden = true;
    confirmInput.value = '';
    unlockBtn.textContent = 'Déverrouiller';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void refresh();

  $('#login-btn').addEventListener('click', async () => {
    const errBox = $('#login-error') as HTMLElement;
    errBox.hidden = true;
    const email = ($('#login-email') as HTMLInputElement).value.trim();
    const password = ($('#login-password') as HTMLInputElement).value;
    const tenantId = ($('#login-tenant') as HTMLInputElement).value.trim() || '1';
    if (!email || !password) {
      errBox.textContent = 'E-mail et mot de passe requis.';
      errBox.hidden = false;
      return;
    }
    const resp = (await send({ kind: 'login', email, password, tenantId })) as OkResp | ErrResp;
    if ('ok' in resp && resp.ok) {
      ($('#login-password') as HTMLInputElement).value = '';
      await refresh();
    } else {
      errBox.textContent = (resp as ErrResp).error || 'Connexion refusée.';
      errBox.hidden = false;
    }
  });

  $('#unlock-btn').addEventListener('click', async () => {
    const passwordInput = $<HTMLInputElement>('#master-password');
    const confirmInput = $<HTMLInputElement>('#master-password-confirm');
    const errorBox = $('#unlock-error');
    errorBox.hidden = true;

    const status = (await send({ kind: 'status' })) as StatusResp;
    const isSetup = status.vaultEmpty === true;

    if (!passwordInput.value || passwordInput.value.length < 8) {
      errorBox.textContent = 'Mot de passe maître trop court (≥ 8 caractères).';
      errorBox.hidden = false;
      return;
    }
    if (isSetup) {
      if (passwordInput.value !== confirmInput.value) {
        errorBox.textContent = 'Les deux saisies ne correspondent pas.';
        errorBox.hidden = false;
        return;
      }
    }

    const resp = (await send({
      kind: 'unlock',
      password: passwordInput.value,
    })) as OkResp | ErrResp;
    if ('ok' in resp && resp.ok) {
      passwordInput.value = '';
      confirmInput.value = '';
      await refresh();
    } else {
      errorBox.textContent = (resp as ErrResp).error || 'Déverrouillage refusé.';
      errorBox.hidden = false;
    }
  });

  const doLogout = async () => {
    await send({ kind: 'logout' });
    await refresh();
  };
  $('#logout-btn').addEventListener('click', () => void doLogout());
  $('#logout-btn-2').addEventListener('click', () => void doLogout());

  $('#lock-btn').addEventListener('click', async () => {
    await send({ kind: 'lock' });
    await refresh();
  });

  $('#open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
