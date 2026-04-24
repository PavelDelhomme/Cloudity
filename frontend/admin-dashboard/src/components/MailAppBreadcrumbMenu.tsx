import React, { useEffect, useRef, useState } from 'react'
import { Loader2, Mail, MoreVertical, Plus, RefreshCw, Settings } from 'lucide-react'

export type MailAppBreadcrumbMenuProps = {
  onOpenSettings: () => void
  onConnectGoogle: () => void
  onAddAccount: () => void
  onRefresh: () => void
  googleConnecting: boolean
  syncLocked: boolean
  refreshSpinning: boolean
  refreshDisabled: boolean
}

/**
 * Menu « Mail » à côté du fil d’Ariane (Tableau de bord > Mail) : paramètres d’app,
 * Google, ajout de boîte, synchro — libère la barre de titre de la page Mail.
 */
export function MailAppBreadcrumbMenu({
  onOpenSettings,
  onConnectGoogle,
  onAddAccount,
  onRefresh,
  googleConnecting,
  syncLocked,
  refreshSpinning,
  refreshDisabled,
}: MailAppBreadcrumbMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu Mail"
        title="Actions Mail (comptes, synchro, paramètres)"
      >
        <Mail className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <MoreVertical className="h-4 w-4 shrink-0 text-gray-500 dark:text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-[60] mt-1 min-w-[14rem] rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2.5 text-sm text-gray-800 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/80 flex items-center gap-2"
            onClick={() => {
              setOpen(false)
              onOpenSettings()
            }}
          >
            <Settings className="h-4 w-4 shrink-0 text-gray-500 dark:text-slate-400" aria-hidden />
            Paramètres Mail
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={googleConnecting}
            className="w-full text-left px-3 py-2.5 text-sm text-gray-800 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/80 flex items-center gap-2 disabled:opacity-50"
            onClick={() => {
              setOpen(false)
              onConnectGoogle()
            }}
          >
            {googleConnecting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : null}
            Se connecter avec Google
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2.5 text-sm text-gray-800 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/80 flex items-center gap-2"
            onClick={() => {
              setOpen(false)
              onAddAccount()
            }}
          >
            <Plus className="h-4 w-4 shrink-0 text-gray-500 dark:text-slate-400" aria-hidden />
            Ajouter une boîte
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-slate-700" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={syncLocked || refreshDisabled}
            className="w-full text-left px-3 py-2.5 text-sm text-gray-800 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/80 flex items-center gap-2 disabled:opacity-50"
            onClick={() => {
              setOpen(false)
              onRefresh()
            }}
          >
            {refreshSpinning ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />}
            Actualiser (IMAP)
          </button>
        </div>
      )}
    </div>
  )
}
