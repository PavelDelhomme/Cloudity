/**
 * Service worker MV3 — état du coffre Cloudity Pass.
 *
 * Responsabilités :
 *   1. Garder la **master key** en mémoire **du service worker** (jamais
 *      `chrome.storage`, jamais `localStorage` du popup).
 *   2. Auto-lock après {@link AUTO_LOCK_MS} d'inactivité (par défaut 5 min)
 *      via `chrome.alarms` — survit aux suspensions du service worker
 *      (MV3 le réveille pour l'alarme).
 *   3. Servir les requêtes du **popup** et du **content script** par
 *      `chrome.runtime.onMessage` (cf. {@link PassMessage}).
 *
 * **Hors scope du squelette** (MP-06 post-sprint) :
 *   - dérivation Argon2id réelle via `@cloudity/pass-crypto` (pour
 *     l'instant, le popup affiche juste l'état locked/unlocked) ;
 *   - communication HTTP vers `passwords-service` (à brancher quand
 *     l'API gateway est jointe depuis l'extension : cf. options).
 */

export {};

const AUTO_LOCK_MS = 5 * 60 * 1000;
const ALARM_NAME = 'cloudity-pass-auto-lock';
const STORAGE_GATEWAY_URL = 'cloudity_pass_gateway_url_v1';
const STORAGE_VAULT_USER_ID = 'cloudity_pass_user_id_v1';

interface VaultState {
  unlocked: boolean;
  /** Master key (32 octets) — uniquement quand `unlocked === true`. */
  masterKey?: Uint8Array;
  /** Timestamp Unix de la dernière activité utilisateur (popup ou content). */
  lastActivityAt: number;
  /** ID utilisateur Cloudity courant — utilisé pour dériver le salt user. */
  userId?: number;
}

const state: VaultState = {
  unlocked: false,
  lastActivityAt: 0,
};

/**
 * Wipe RAM (`fill(0)`) avant de jeter la référence.
 * Identique à `mobile/pass/lib/pass_crypto_kdf.dart::zeroize`.
 */
function zeroize(buf?: Uint8Array): void {
  if (!buf) return;
  buf.fill(0);
}

function lock(reason: string): void {
  if (!state.unlocked) return;
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

interface UnlockMessage {
  kind: 'unlock';
  password: string;
  userId: number;
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

type PassMessage =
  | UnlockMessage
  | PingMessage
  | LockMessage
  | StatusMessage
  | SaveGatewayMessage;

interface StatusResponse {
  unlocked: boolean;
  lastActivityAt: number;
  autoLockMs: number;
  gatewayUrl?: string;
  userId?: number;
}

interface OkResponse {
  ok: true;
}

interface ErrResponse {
  ok: false;
  error: string;
}

type PassResponse = StatusResponse | OkResponse | ErrResponse;

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
    case 'status': {
      const stored = await chrome.storage.local.get([
        STORAGE_GATEWAY_URL,
        STORAGE_VAULT_USER_ID,
      ]);
      return {
        unlocked: state.unlocked,
        lastActivityAt: state.lastActivityAt,
        autoLockMs: AUTO_LOCK_MS,
        gatewayUrl: stored[STORAGE_GATEWAY_URL] as string | undefined,
        userId: state.userId ?? (stored[STORAGE_VAULT_USER_ID] as number | undefined),
      };
    }
    case 'save-gateway':
      await chrome.storage.local.set({
        [STORAGE_GATEWAY_URL]: msg.gatewayUrl.trim().replace(/\/$/, ''),
      });
      return { ok: true };
    case 'unlock': {
      // TODO MP-06 : intégrer @cloudity/pass-crypto :
      //   1. Récupérer le salt utilisateur déterministe (préfixe + userId)
      //   2. Argon2id côté extension (profil `desktop` ou `mobile-high`)
      //   3. Appeler /pass/vaults pour récupérer la liste
      //   4. Stocker la MK dans `state.masterKey` + bumpActivity()
      // Le squelette livré ici prouve juste l'état locked/unlocked.
      if (!msg.password || msg.password.length < 8) {
        return { ok: false, error: 'mot_de_passe_trop_court' };
      }
      state.unlocked = true;
      state.userId = msg.userId;
      await chrome.storage.local.set({ [STORAGE_VAULT_USER_ID]: msg.userId });
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
  console.info('[cloudity-pass] extension installed (squelette MV3 v0.1.0)');
});

self.addEventListener('beforeunload', () => {
  lock('worker-shutdown');
});

console.info('[cloudity-pass] background service worker loaded');
