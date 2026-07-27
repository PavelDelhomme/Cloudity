/**
 * Page d'options — gateway + préférences Pass (sync compte utilisateur).
 */

export {};

import type { PassPreferences } from '../shared/userPreferences';

interface StatusResp {
  unlocked: boolean;
  gatewayUrl?: string;
  passPrefs: PassPreferences;
  authenticated: boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`options: élément manquant ${sel}`);
  return el;
};

function showStatus(text: string): void {
  const status = $('#status');
  status.textContent = text;
  status.hidden = false;
}

function readPassForm(): Partial<PassPreferences> {
  return {
    clipboardEnabled: ($('#clipboard-enabled') as HTMLInputElement).checked,
    clipboardClearMs: Number(($('#clipboard-clear-ms') as HTMLSelectElement).value),
    totpAutoCopy: ($('#totp-auto-copy') as HTMLInputElement).checked,
    autoLockMs: Number(($('#auto-lock-ms') as HTMLSelectElement).value),
    digitalAssetLinksEnabled: ($('#dal-enabled') as HTMLInputElement).checked,
  };
}

function fillPassForm(prefs: PassPreferences): void {
  ($('#clipboard-enabled') as HTMLInputElement).checked = prefs.clipboardEnabled;
  ($('#clipboard-clear-ms') as HTMLSelectElement).value = String(prefs.clipboardClearMs);
  ($('#totp-auto-copy') as HTMLInputElement).checked = prefs.totpAutoCopy;
  ($('#auto-lock-ms') as HTMLSelectElement).value = String(prefs.autoLockMs);
  ($('#dal-enabled') as HTMLInputElement).checked = prefs.digitalAssetLinksEnabled;
  ($('#totp-auto-copy') as HTMLInputElement).disabled = !prefs.clipboardEnabled;
}

document.addEventListener('DOMContentLoaded', () => {
  const input = $<HTMLInputElement>('#gateway-url');
  chrome.runtime.sendMessage({ kind: 'status' }, (resp: StatusResp) => {
    if (resp?.gatewayUrl) input.value = resp.gatewayUrl;
    if (resp?.passPrefs) fillPassForm(resp.passPrefs);
  });

  $('#clipboard-enabled').addEventListener('change', () => {
    const enabled = ($('#clipboard-enabled') as HTMLInputElement).checked;
    ($('#totp-auto-copy') as HTMLInputElement).disabled = !enabled;
  });

  $('#save-gateway').addEventListener('click', () => {
    const value = input.value.trim();
    if (!/^https?:\/\//.test(value)) {
      showStatus('URL invalide (préfixe http(s):// requis).');
      return;
    }
    chrome.runtime.sendMessage(
      { kind: 'save-gateway', gatewayUrl: value },
      (resp: { ok?: boolean; error?: string }) => {
        showStatus(resp?.ok ? 'URL enregistrée ✓' : (resp?.error ?? 'Erreur inconnue.'));
      },
    );
  });

  $('#sync-prefs').addEventListener('click', () => {
    chrome.runtime.sendMessage({ kind: 'sync-prefs' }, (resp: { ok?: boolean; error?: string }) => {
      if (resp?.ok) {
        chrome.runtime.sendMessage({ kind: 'status' }, (st: StatusResp) => {
          if (st?.passPrefs) fillPassForm(st.passPrefs);
          showStatus('Préférences synchronisées depuis le compte ✓');
        });
      } else {
        showStatus(resp?.error ?? 'Sync impossible (connecte-toi via le popup).');
      }
    });
  });

  $('#save-pass-prefs').addEventListener('click', () => {
    const patch = readPassForm();
    chrome.runtime.sendMessage(
      { kind: 'save-pass-prefs', patch },
      (resp: { ok?: boolean; error?: string }) => {
        showStatus(resp?.ok ? 'Préférences Pass enregistrées ✓' : (resp?.error ?? 'Erreur.'));
      },
    );
  });
});
