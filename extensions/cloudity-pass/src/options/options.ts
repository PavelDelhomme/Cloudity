/**
 * Page d'options de l'extension. Stocke l'URL du gateway Cloudity dans
 * `chrome.storage.local`. Aucun secret ici.
 */

export {};

interface StatusResp {
  unlocked: boolean;
  lastActivityAt: number;
  autoLockMs: number;
  gatewayUrl?: string;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`options: élément manquant ${sel}`);
  return el;
};

document.addEventListener('DOMContentLoaded', () => {
  const input = $<HTMLInputElement>('#gateway-url');
  const status = $('#status');
  chrome.runtime.sendMessage({ kind: 'status' }, (resp: StatusResp) => {
    if (resp?.gatewayUrl) input.value = resp.gatewayUrl;
  });
  $('#save-gateway').addEventListener('click', () => {
    const value = input.value.trim();
    if (!/^https?:\/\//.test(value)) {
      status.textContent = 'URL invalide (préfixe http(s):// requis).';
      status.hidden = false;
      return;
    }
    chrome.runtime.sendMessage(
      { kind: 'save-gateway', gatewayUrl: value },
      (resp: { ok?: boolean; error?: string }) => {
        if (resp?.ok) {
          status.textContent = 'URL enregistrée ✓';
          status.hidden = false;
        } else {
          status.textContent = resp?.error ?? 'Erreur inconnue.';
          status.hidden = false;
        }
      },
    );
  });
});
