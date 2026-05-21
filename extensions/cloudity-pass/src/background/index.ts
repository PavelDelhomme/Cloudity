/**
 * Service worker MV3 — session Cloudity + état du coffre Pass.
 *
 * Parcours aligné hub web / mobile Pass :
 *   1. Connexion `POST /auth/login` (tokens en `chrome.storage.session` uniquement).
 *   2. Sonde `GET /pass/vaults` → liste vide = **initialisation** maître (UI popup) ;
 *      sinon **déverrouillage**.
 *   3. `unlock` : Argon2id + salt utilisateur (`@cloudity/pass-crypto`, profil `desktop`
 *      = même défaut que le hub web), MK en RAM du worker uniquement.
 */

export {};

import {
  ARGON2ID_PROFILES,
  decryptItemFromVault,
  deriveMasterKey,
  type ItemPlaintextV1,
} from '@cloudity/pass-crypto';
import { hostMatchesEntry } from '../shared/domainMatcher';

const AUTO_LOCK_MS = 5 * 60 * 1000;
const ALARM_NAME = 'cloudity-pass-auto-lock';
const STORAGE_GATEWAY_URL = 'cloudity_pass_gateway_url_v1';

/** Session courte (fermée à la fermeture du navigateur) — jamais le maître. */
const SESS_ACCESS = 'cloudity_pass_sess_access_v1';
const SESS_REFRESH = 'cloudity_pass_sess_refresh_v1';
const SESS_USER_ID = 'cloudity_pass_sess_user_id_v1';

const USER_SALT_PREFIX = 'cloudity-pass:v1:user-salt:';

interface VaultState {
  unlocked: boolean;
  masterKey?: Uint8Array;
  lastActivityAt: number;
  userIdStr?: string;
}

const state: VaultState = {
  unlocked: false,
  lastActivityAt: 0,
};

function zeroize(buf?: Uint8Array): void {
  if (!buf) return;
  buf.fill(0);
}

function lock(reason: string): void {
  if (!state.unlocked && !state.masterKey) return;
  zeroize(state.masterKey);
  state.masterKey = undefined;
  state.unlocked = false;
  void chrome.alarms.clear(ALARM_NAME);
  console.info(`[cloudity-pass] vault locked (${reason})`);
}

function bumpActivity(): void {
  state.lastActivityAt = Date.now();
  if (state.unlocked) {
    void chrome.alarms.create(ALARM_NAME, {
      when: state.lastActivityAt + AUTO_LOCK_MS,
    });
  }
}

async function deriveUserSalt(userId: string | number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const input = enc.encode(USER_SALT_PREFIX + String(userId));
  const buf = await crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(buf.slice(0, 16));
}

async function getGatewayUrl(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get([STORAGE_GATEWAY_URL]);
  const u = stored[STORAGE_GATEWAY_URL] as string | undefined;
  return u?.trim().replace(/\/$/, '');
}

async function sessionArea(): Promise<chrome.storage.StorageArea | null> {
  return chrome.storage.session ?? null;
}

async function clearSessionTokens(): Promise<void> {
  const area = await sessionArea();
  if (!area) return;
  await area.remove([SESS_ACCESS, SESS_REFRESH, SESS_USER_ID]);
}

async function readSession(): Promise<{
  access: string;
  refresh: string;
  userIdStr: string;
} | null> {
  const area = await sessionArea();
  if (!area) return null;
  const o = await area.get([SESS_ACCESS, SESS_REFRESH, SESS_USER_ID]);
  const access = o[SESS_ACCESS] as string | undefined;
  const refresh = o[SESS_REFRESH] as string | undefined;
  const userIdStr = o[SESS_USER_ID] as string | undefined;
  if (!access || !userIdStr) return null;
  return { access, refresh: refresh ?? '', userIdStr };
}

async function writeSessionTokens(
  access: string,
  refresh: string,
  userIdStr: string,
): Promise<void> {
  const area = await sessionArea();
  if (!area) {
    throw new Error('chrome.storage.session indisponible (Chrome 114+ requis pour la connexion dans l’extension).');
  }
  await area.set({
    [SESS_ACCESS]: access,
    [SESS_REFRESH]: refresh,
    [SESS_USER_ID]: userIdStr,
  });
}

async function fetchVaultsEmpty(accessToken: string, gateway: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${gateway}/pass/vaults`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? data : null;
    if (!list) return null;
    return list.length === 0;
  } catch {
    return null;
  }
}

// --- Messages --------------------------------------------------------

interface LoginMessage {
  kind: 'login';
  email: string;
  password: string;
  tenantId: string;
}

interface LogoutMessage {
  kind: 'logout';
}

interface UnlockMessage {
  kind: 'unlock';
  password: string;
}

interface PingMessage {
  kind: 'ping';
}

interface LockMessage {
  kind: 'lock';
}

interface StatusMessage {
  kind: 'status';
}

interface SaveGatewayMessage {
  kind: 'save-gateway';
  gatewayUrl: string;
}

interface ListCandidatesMessage {
  kind: 'list-candidates';
  pageUrl: string;
}

interface FillActiveTabMessage {
  kind: 'fill-active-tab';
  pageUrl: string;
  itemId: number;
  vaultId: number;
}

type PassMessage =
  | LoginMessage
  | LogoutMessage
  | UnlockMessage
  | PingMessage
  | LockMessage
  | StatusMessage
  | SaveGatewayMessage
  | ListCandidatesMessage
  | FillActiveTabMessage;

interface StatusResponse {
  ok?: undefined;
  unlocked: boolean;
  lastActivityAt: number;
  autoLockMs: number;
  gatewayUrl?: string;
  /** Session Cloudity active (JWT session storage). */
  authenticated: boolean;
  /** `true` = aucun coffre → UI « initialiser » ; `false` = coffres présents ; `null` = inconnu / erreur réseau. */
  vaultEmpty: boolean | null;
  userIdStr?: string;
  sessionApiAvailable: boolean;
}

interface OkResponse {
  ok: true;
}

interface ErrResponse {
  ok: false;
  error: string;
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

interface CandidatesResponse {
  ok: true;
  candidates: AutofillCandidate[];
}

type PassResponse = StatusResponse | OkResponse | ErrResponse | CandidatesResponse;

interface VaultResponse {
  id: number;
  name: string;
}

interface PassItemResponse {
  id: number;
  vault_id: number;
  ciphertext: string;
}

async function apiJson<T>(gateway: string, accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${gateway}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} sur ${path}`);
  }
  return (await res.json()) as T;
}

function stringField(plain: ItemPlaintextV1, key: string): string {
  const value = plain.fields[key];
  return typeof value === 'string' ? value : '';
}

async function listAutofillCandidates(pageUrl: string): Promise<AutofillCandidate[]> {
  if (!state.unlocked || !state.masterKey) {
    throw new Error('Coffre verrouillé.');
  }
  const sess = await readSession();
  const gateway = await getGatewayUrl();
  if (!sess?.access || !gateway) {
    throw new Error('Session Cloudity ou gateway manquant.');
  }

  const pageHost = new URL(pageUrl).hostname;
  const vaults = await apiJson<VaultResponse[]>(gateway, sess.access, '/pass/vaults');
  const out: AutofillCandidate[] = [];

  for (const vault of vaults) {
    const items = await apiJson<PassItemResponse[]>(
      gateway,
      sess.access,
      `/pass/vaults/${vault.id}/items`,
    );
    for (const item of items) {
      try {
        const plain = decryptItemFromVault({
          masterKey: state.masterKey,
          vaultId: String(vault.id),
          encoded: item.ciphertext,
        });
        if (plain.type !== 'login') continue;
        const url = stringField(plain, 'url');
        const username = stringField(plain, 'username');
        const password = stringField(plain, 'password');
        if (!url || !password || !hostMatchesEntry(pageHost, url)) continue;
        out.push({
          id: item.id,
          vaultId: vault.id,
          vaultName: vault.name || `Coffre #${vault.id}`,
          title: stringField(plain, 'title') || username || url,
          url,
          username,
          password,
        });
      } catch (e) {
        console.warn('[cloudity-pass] item non déchiffrable ignoré', item.id, e);
      }
    }
  }

  bumpActivity();
  return out.slice(0, 10);
}

chrome.runtime.onMessage.addListener(
  (msg: PassMessage, _sender, sendResponse: (r: PassResponse) => void) => {
    handleMessage(msg)
      .then(sendResponse)
      .catch((e: unknown) => {
        const err = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: err });
      });
    return true;
  },
);

async function handleMessage(msg: PassMessage): Promise<PassResponse> {
  switch (msg.kind) {
    case 'ping':
      bumpActivity();
      return { ok: true };
    case 'lock':
      lock('user-requested');
      return { ok: true };
    case 'logout':
      lock('logout');
      await clearSessionTokens();
      state.userIdStr = undefined;
      return { ok: true };
    case 'status': {
      const stored = await chrome.storage.local.get([STORAGE_GATEWAY_URL]);
      const gatewayUrl = stored[STORAGE_GATEWAY_URL] as string | undefined;
      const sess = await readSession();
      const authenticated = !!sess?.access;
      let vaultEmpty: boolean | null = null;
      if (authenticated && gatewayUrl && sess) {
        vaultEmpty = await fetchVaultsEmpty(sess.access, gatewayUrl.trim().replace(/\/$/, ''));
      }
      return {
        unlocked: state.unlocked,
        lastActivityAt: state.lastActivityAt,
        autoLockMs: AUTO_LOCK_MS,
        gatewayUrl,
        authenticated,
        vaultEmpty,
        userIdStr: sess?.userIdStr ?? state.userIdStr,
        sessionApiAvailable: (await sessionArea()) != null,
      };
    }
    case 'save-gateway':
      await chrome.storage.local.set({
        [STORAGE_GATEWAY_URL]: msg.gatewayUrl.trim().replace(/\/$/, ''),
      });
      return { ok: true };
    case 'list-candidates':
      return { ok: true, candidates: await listAutofillCandidates(msg.pageUrl) };
    case 'fill-active-tab': {
      if (!state.unlocked) {
        return { ok: false, error: 'Coffre verrouillé.' };
      }
      const candidates = await listAutofillCandidates(msg.pageUrl);
      const match = candidates.find((c) => c.id === msg.itemId && c.vaultId === msg.vaultId);
      if (!match) {
        return { ok: false, error: 'Entrée introuvable pour ce domaine.' };
      }
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId == null) {
        return { ok: false, error: 'Aucun onglet actif.' };
      }
      try {
        await chrome.tabs.sendMessage(tabId, { kind: 'fill-login', candidate: match });
      } catch {
        return {
          ok: false,
          error:
            'Impossible de joindre la page — recharge l’onglet ou ouvre un site avec formulaire de connexion.',
        };
      }
      bumpActivity();
      return { ok: true };
    }
    case 'login': {
      const gateway = await getGatewayUrl();
      if (!gateway) {
        return { ok: false, error: 'Configurer l’URL du gateway (page Paramètres de l’extension).' };
      }
      const res = await fetch(`${gateway}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: msg.email.trim(),
          password: msg.password,
          tenant_id: msg.tenantId.trim(),
        }),
      });
      const body: Record<string, unknown> = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        return { ok: false, error: String(body['error'] ?? `HTTP ${res.status}`) };
      }
      if (body['requires_2fa'] === true) {
        return {
          ok: false,
          error: 'Compte avec 2FA : connecte-toi une fois sur le hub web, ou ajoute le flux TOTP (MP-06).',
        };
      }
      const access = body['access_token'] as string | undefined;
      const refresh = (body['refresh_token'] as string | undefined) ?? '';
      const userIdStr = String(body['user_id'] ?? '').trim();
      if (!access || !userIdStr) {
        return { ok: false, error: 'Réponse login sans access_token ou user_id.' };
      }
      await writeSessionTokens(access, refresh, userIdStr);
      state.userIdStr = userIdStr;
      lock('new-login');
      return { ok: true };
    }
    case 'unlock': {
      const sess = await readSession();
      if (!sess?.access) {
        return { ok: false, error: 'Non connecté — utilise d’abord « Connexion Cloudity ».' };
      }
      if (!msg.password || msg.password.length < 8) {
        return { ok: false, error: 'mot_de_passe_trop_court' };
      }
      const salt = await deriveUserSalt(sess.userIdStr);
      const profile = ARGON2ID_PROFILES.desktop;
      let mk: Uint8Array;
      try {
        mk = await deriveMasterKey({
          password: msg.password,
          salt,
          params: profile,
        });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'deriveMasterKey_failed' };
      }
      if (state.unlocked) {
        lock('re-unlock');
      }
      state.masterKey = mk;
      state.userIdStr = sess.userIdStr;
      state.unlocked = true;
      bumpActivity();
      return { ok: true };
    }
    default: {
      const exhaustive: never = msg;
      return { ok: false, error: `unknown_message:${String(exhaustive)}` };
    }
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    lock('auto-lock-timeout');
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.info('[cloudity-pass] extension installed (MV3 v0.2.0 — session + vault probe)');
});

self.addEventListener('beforeunload', () => {
  lock('worker-shutdown');
});

console.info('[cloudity-pass] background service worker loaded');
