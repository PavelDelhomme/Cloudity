import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, MessagesSquare, Plus, RefreshCw, Settings, Tag } from 'lucide-react'

export type MailAppChromeMenuProps = {
  conversationMode: boolean
  onToggleConversations: () => void
  onRefresh: () => void
  onOpenSettings: () => void
  onOpenRules: () => void
  onConnectGoogle: () => void
  onAddAccount: () => void
  refreshBusy: boolean
  googleBusy: boolean
}

/**
 * Actions Mail dans la barre globale (fil d’Ariane) — rendu isolé pour éviter les boucles React
 * si le parent ne ré-abonne pas au contexte « affichage ».
 */
export function MailAppChromeMenu({
  conversationMode,
  onToggleConversations,
  onRefresh,
  onOpenSettings,
  onOpenRules,
  onConnectGoogle,
  onAddAccount,
  refreshBusy,
  googleBusy,
}: MailAppChromeMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleConversations}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
          conversationMode
            ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20 text-brand-800 dark:text-brand-200'
            : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'
        }`}
        title="Regrouper en conversations (1 ligne par fil)"
      >
        <MessagesSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Conversations
      </button>
      <div className="relative flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          Menu Mail
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onRefresh()}
          disabled={refreshBusy}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 p-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
          title="Actualiser (IMAP)"
          aria-label="Actualiser la boîte (IMAP)"
        >
          {refreshBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
        </button>
        {open ? (
          <div
            className="absolute right-0 top-full z-[100] mt-1 min-w-[14rem] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1 shadow-lg"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              disabled={refreshBusy}
              onClick={() => {
                onRefresh()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {refreshBusy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              )}
              Actualiser (IMAP)
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenSettings()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Settings className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              Paramètres Mail
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenRules()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Tag className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              Filtres et règles
            </button>
            <div className="my-1 border-t border-slate-200 dark:border-slate-600" />
            <button
              type="button"
              role="menuitem"
              disabled={googleBusy}
              onClick={() => {
                void onConnectGoogle()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {googleBusy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
              Se connecter avec Google
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAddAccount()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Plus className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              Ajouter une boîte mail
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
