import React from 'react'
import { Card } from '@cloudity/ui'
import { useThemePreferences } from '../../../theme/themeContext'
import {
  APP_LABELS,
  CLOUDITY_APP_IDS,
  THEME_MODE_LABELS,
  type CloudityAppId,
  type ThemeMode,
} from '../../../lib/userPreferencesTypes'

export default function ThemePreferencesSection() {
  const { prefs, setAppTheme, setDefaultTheme } = useThemePreferences()

  const renderSelect = (
    key: string,
    label: string,
    value: ThemeMode,
    onChange: (m: ThemeMode) => void,
  ) => (
    <label
      key={key}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
    >
      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ThemeMode)}
        className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
      >
        {(Object.keys(THEME_MODE_LABELS) as ThemeMode[]).map((m) => (
          <option key={m} value={m}>
            {THEME_MODE_LABELS[m]}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <Card>
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Thème</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Par défaut pour toutes les apps, ou personnalisez chaque application (web et mobile synchronisés
            via votre compte).
          </p>
        </div>
        {renderSelect('default', 'Thème par défaut', prefs.theme.default, (m) => void setDefaultTheme(m))}
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            Par application
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 px-3">
            {CLOUDITY_APP_IDS.filter((id) => id !== 'hub').map((appId: CloudityAppId) =>
              renderSelect(
                appId,
                APP_LABELS[appId],
                prefs.theme.apps[appId] ?? prefs.theme.default,
                (m) => void setAppTheme(appId, m),
              ),
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
