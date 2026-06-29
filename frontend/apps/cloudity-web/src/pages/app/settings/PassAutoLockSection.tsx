import React, { useCallback, useState } from 'react'
import { Card } from '@cloudity/ui'
import {
  formatPassAutoLockLabel,
  getPassAutoLockAfterMs,
  PASS_AUTO_LOCK_OPTIONS,
  setPassAutoLockAfterMs,
} from '../pass/passAutoLockSettings'

export default function PassAutoLockSection() {
  const [autoLockMs, setAutoLockMs] = useState(() => getPassAutoLockAfterMs())

  const onChange = useCallback((ms: number) => {
    setPassAutoLockAfterMs(ms)
    setAutoLockMs(ms)
  }, [])

  return (
    <Card>
      <div className="p-6 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Cloudity Pass</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Verrouillage automatique du coffre après une période d&apos;inactivité sur cette session
            navigateur. Actuellement : <strong className="font-medium text-slate-700 dark:text-slate-200">{formatPassAutoLockLabel(autoLockMs)}</strong>.
          </p>
        </div>
        <label htmlFor="pass-auto-lock-delay" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Délai d&apos;inactivité
        </label>
        <select
          id="pass-auto-lock-delay"
          value={autoLockMs}
          onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
          className="w-full max-w-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        >
          {PASS_AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={opt.ms} value={opt.ms}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </Card>
  )
}
