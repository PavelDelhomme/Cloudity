import React from 'react'
import { Card } from '@cloudity/ui'
import { useThemePreferences } from '../../../theme/themeContext'
import { PASS_AUTO_LOCK_OPTIONS } from '../pass/passAutoLockSettings'

const CLIPBOARD_OPTIONS = [
  { label: '15 secondes', ms: 15_000 },
  { label: '30 secondes', ms: 30_000 },
  { label: '1 minute', ms: 60_000 },
  { label: '2 minutes', ms: 120_000 },
  { label: 'Jamais (effacement manuel)', ms: 0 },
] as const

export default function PassClipboardSettingsSection() {
  const { prefs, updatePassPrefs } = useThemePreferences()
  const pass = prefs.pass

  return (
    <Card>
      <div className="p-6 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Pass — presse-papier</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Copie sécurisée des identifiants et codes TOTP (web, extension, mobile). L&apos;auto-effacement
            protège le presse-papier natif du navigateur ou de l&apos;OS.
          </p>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-800 dark:text-slate-200">Autoriser la copie dans le presse-papier</span>
          <input
            type="checkbox"
            checked={pass.clipboardEnabled}
            onChange={(e) => void updatePassPrefs({ clipboardEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
        </label>

        <label className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-sm text-slate-800 dark:text-slate-200">Effacer automatiquement après</span>
          <select
            value={pass.clipboardClearMs}
            disabled={!pass.clipboardEnabled}
            onChange={(e) => void updatePassPrefs({ clipboardClearMs: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-50"
          >
            {CLIPBOARD_OPTIONS.map((o) => (
              <option key={o.ms} value={o.ms}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-start justify-between gap-4">
          <span className="text-sm text-slate-800 dark:text-slate-200">
            Copier automatiquement le code TOTP à chaque rotation
            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sous-option du presse-papier — utile sur mobile et desktop.
            </span>
          </span>
          <input
            type="checkbox"
            checked={pass.totpAutoCopy}
            disabled={!pass.clipboardEnabled}
            onChange={(e) => void updatePassPrefs({ totpAutoCopy: e.target.checked })}
            className="h-4 w-4 mt-1 rounded border-slate-300 disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-sm text-slate-800 dark:text-slate-200">Verrouillage auto du coffre</span>
          <select
            value={pass.autoLockMs}
            onChange={(e) => void updatePassPrefs({ autoLockMs: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            {PASS_AUTO_LOCK_OPTIONS.map((o) => (
              <option key={o.ms} value={o.ms}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-start justify-between gap-4 border-t border-slate-100 dark:border-slate-700 pt-4">
          <span className="text-sm text-slate-800 dark:text-slate-200">
            Digital Asset Links (Android)
            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Améliore l&apos;autofill Pass sur les apps Android natives (cf. docs/produit/PASS-DIGITAL-ASSET-LINKS.md).
            </span>
          </span>
          <input
            type="checkbox"
            checked={pass.digitalAssetLinksEnabled}
            onChange={(e) => void updatePassPrefs({ digitalAssetLinksEnabled: e.target.checked })}
            className="h-4 w-4 mt-1 rounded border-slate-300"
          />
        </label>
      </div>
    </Card>
  )
}
