/**
 * Popup MV3 — connexion Cloudity puis initialisation / déverrouillage du coffre.
 * Aligné sur le hub web (`PassPage` / `UnlockScreen`) et `mobile/pass`.
 *
 * Coffre déverrouillé : entrées login pour le domaine de l’onglet actif
 * (copie identifiant / mot de passe, remplissage sur clic utilisateur).
 */

export {};

interface StatusResp {
  unlocked: boolean;
  lastActivityAt: number;
  autoLockMs: number;
  passPrefs?: {
    clipboardEnabled: boolean;
    clipboardClearMs: number;
  };
  gatewayUrl?: string;
  authenticated: boolean;
  vaultEmpty: boolean | null;
  userIdStr?: string;
  sessionApiAvailable: boolean;
}

interface AutofillCandidate {
  id: number;
  vaultId: number;
  vaultName: string;
  title: string;
  url: string;
  username: string;
  password: string;
}

interface CandidatesResp {
  ok: true;
  candidates: AutofillCandidate[];
}

interface OkResp {
  ok: true;
}

interface ErrResp {
  ok: false;
  error: string;
}

type AnyResp = StatusResp | OkResp | ErrResp | CandidatesResp;

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
let allCandidates: AutofillCandidate[] = [];
let activeTabUrl: string | null = null;

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

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getActiveTabUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        resolve(null);
        return;
      }
      resolve(url);
    });
  });
}

function hostLabel(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return pageUrl;
  }
}

function matchesFilter(c: AutofillCandidate, q: string): boolean {
  if (!q) return true;
  const hay = `${c.title} ${c.username} ${c.vaultName} ${c.url}`.toLowerCase();
  return hay.includes(q);
}

function renderCandidates(): void {
  const list = $('#candidates-list');
  const status = $('#candidates-status');
  const filterLabel = $('#candidates-filter-label');
  const filterInput = $('#candidates-filter') as HTMLInputElement;
  const errBox = $('#candidates-error');

  errBox.hidden = true;
  list.innerHTML = '';

  if (!activeTabUrl) {
    setVisible(filterLabel, false);
    setVisible(list, false);
    status.hidden = false;
    status.textContent =
      'Ouvre un site web (http/https) dans l’onglet actif pour voir les entrées correspondantes.';
    return;
  }

  setVisible(filterLabel, true);
  const q = filterInput.value.trim().toLowerCase();
  const filtered = allCandidates.filter((c) => matchesFilter(c, q));

  if (allCandidates.length === 0) {
    setVisible(list, false);
    status.hidden = false;
    status.textContent = `Aucune entrée login pour ${hostLabel(activeTabUrl)}.`;
    return;
  }

  status.hidden = false;
  status.textContent =
    filtered.length === allCandidates.length
      ? `${allCandidates.length} entrée(s) pour ${hostLabel(activeTabUrl)}.`
      : `${filtered.length} / ${allCandidates.length} entrée(s).`;

  if (filtered.length === 0) {
    setVisible(list, false);
    return;
  }

  setVisible(list, true);
  for (const c of filtered) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="candidate-title">${escapeText(c.title)}</span>
      <span class="candidate-meta">${escapeText(c.username || '—')} · ${escapeText(c.vaultName)}</span>
      <div class="candidate-actions"></div>
    `;
    const actions = li.querySelector('.candidate-actions') as HTMLDivElement;

    const fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.className = 'primary-fill';
    fillBtn.textContent = 'Remplir l’onglet';
    fillBtn.addEventListener('click', () => void fillActiveTab(c));

    const copyUserBtn = document.createElement('button');
    copyUserBtn.type = 'button';
    copyUserBtn.className = 'secondary';
    copyUserBtn.textContent = 'Copier identifiant';
    copyUserBtn.disabled = !c.username;
    copyUserBtn.addEventListener('click', () => void copyText(c.username, copyUserBtn));

    const copyPassBtn = document.createElement('button');
    copyPassBtn.type = 'button';
    copyPassBtn.className = 'secondary';
    copyPassBtn.textContent = 'Copier mot de passe';
    copyPassBtn.addEventListener('click', () => void copyText(c.password, copyPassBtn));

    actions.append(fillBtn, copyUserBtn, copyPassBtn);
    list.appendChild(li);
  }
}

async function copyText(value: string, btn: HTMLButtonElement): Promise<void> {
  if (!value) return;
  const status = (await send({ kind: 'status' })) as StatusResp;
  const prefs = status.passPrefs;
  if (prefs && !prefs.clipboardEnabled) {
    const errBox = $('#candidates-error');
    errBox.textContent = 'Copie presse-papier désactivée (Paramètres → extension).';
    errBox.hidden = false;
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    const ttlMs = prefs?.clipboardClearMs ?? 30_000;
    if (ttlMs > 0) {
      window.setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === value) await navigator.clipboard.writeText('');
        } catch {
          /* permission */
        }
      }, ttlMs);
    }
    const prev = btn.textContent;
    btn.textContent = 'Copié ✓';
    window.setTimeout(() => {
      btn.textContent = prev;
    }, 1200);
    await send({ kind: 'ping' });
  } catch {
    const errBox = $('#candidates-error');
    errBox.textContent = 'Copie refusée par le navigateur.';
    errBox.hidden = false;
  }
}

async function fillActiveTab(c: AutofillCandidate): Promise<void> {
  const errBox = $('#candidates-error');
  errBox.hidden = true;
  if (!activeTabUrl) {
    errBox.textContent = 'Aucun onglet web actif.';
    errBox.hidden = false;
    return;
  }
  const resp = (await send({
    kind: 'fill-active-tab',
    pageUrl: activeTabUrl,
    itemId: c.id,
    vaultId: c.vaultId,
  })) as OkResp | ErrResp;
  if (!('ok' in resp) || !resp.ok) {
    errBox.textContent = (resp as ErrResp).error || 'Remplissage impossible.';
    errBox.hidden = false;
  }
}

async function loadCandidatesForActiveTab(): Promise<void> {
  const tabCtx = $('#tab-context');
  const filterInput = $('#candidates-filter') as HTMLInputElement;

  activeTabUrl = await getActiveTabUrl();
  allCandidates = [];
  filterInput.value = '';

  if (!activeTabUrl) {
    tabCtx.hidden = true;
    renderCandidates();
    return;
  }

  tabCtx.hidden = false;
  tabCtx.textContent = `Onglet : ${hostLabel(activeTabUrl)}`;

  const resp = (await send({ kind: 'list-candidates', pageUrl: activeTabUrl })) as
    | CandidatesResp
    | ErrResp;
  if ('ok' in resp && resp.ok && 'candidates' in resp) {
    allCandidates = resp.candidates;
  } else {
    const errBox = $('#candidates-error');
    errBox.textContent = (resp as ErrResp).error || 'Impossible de charger les entrées.';
    errBox.hidden = false;
  }
  renderCandidates();
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
    await loadCandidatesForActiveTab();
    return;
  }

  stopCountdown();
  setVisible(unlocked, false);
  allCandidates = [];
  activeTabUrl = null;

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

  ($('#candidates-filter') as HTMLInputElement).addEventListener('input', () => {
    renderCandidates();
  });

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
