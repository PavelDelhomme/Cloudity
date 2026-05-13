/**
 * Popup MV3 — UI déverrouillage / verrouillage du coffre.
 *
 * Reste **volontairement minimaliste** : pas de liste d'entrées, pas
 * d'autofill, pas d'appel HTTP `passwords-service`. Ces capacités sont
 * livrées en **MP-06** (cf. `docs/produit/MULTI-PLATEFORME.md`).
 */

export {};

interface StatusResp {
  unlocked: boolean;
  lastActivityAt: number;
  autoLockMs: number;
  gatewayUrl?: string;
  userId?: number;
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

function startCountdown(deadline: number): void {
  stopCountdown();
  const tick = () => {
    const remaining = deadline - Date.now();
    $('#lock-countdown').textContent = formatRemaining(remaining);
    if (remaining <= 0) {
      void refresh();
    }
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

function stopCountdown(): void {
  if (countdownTimer !== undefined) {
    clearInterval(countdownTimer);
    countdownTimer = undefined;
  }
}

async function refresh(): Promise<void> {
  const resp = (await send({ kind: 'status' })) as StatusResp;
  const locked = $('#locked-panel');
  const unlocked = $('#unlocked-panel');
  const badge = $('#status-badge');
  if (resp.unlocked) {
    locked.hidden = true;
    unlocked.hidden = false;
    badge.textContent = 'État : déverrouillé';
    if (resp.lastActivityAt > 0) {
      startCountdown(resp.lastActivityAt + resp.autoLockMs);
    }
  } else {
    locked.hidden = false;
    unlocked.hidden = true;
    badge.textContent = 'État : verrouillé';
    stopCountdown();
  }
  if (resp.userId !== undefined) {
    ($('#user-id') as HTMLInputElement).value = String(resp.userId);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void refresh();

  $('#unlock-btn').addEventListener('click', async () => {
    const userIdInput = $<HTMLInputElement>('#user-id');
    const passwordInput = $<HTMLInputElement>('#master-password');
    const errorBox = $('#unlock-error');
    errorBox.hidden = true;
    const userId = parseInt(userIdInput.value, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      errorBox.textContent = 'ID utilisateur invalide.';
      errorBox.hidden = false;
      return;
    }
    if (!passwordInput.value || passwordInput.value.length < 8) {
      errorBox.textContent = 'Mot de passe trop court (≥ 8 caractères).';
      errorBox.hidden = false;
      return;
    }
    const resp = (await send({
      kind: 'unlock',
      password: passwordInput.value,
      userId,
    })) as OkResp | ErrResp;
    if ('ok' in resp && resp.ok) {
      passwordInput.value = '';
      await refresh();
    } else {
      errorBox.textContent = (resp as ErrResp).error || 'Déverrouillage refusé.';
      errorBox.hidden = false;
    }
  });

  $('#lock-btn').addEventListener('click', async () => {
    await send({ kind: 'lock' });
    await refresh();
  });

  $('#open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
