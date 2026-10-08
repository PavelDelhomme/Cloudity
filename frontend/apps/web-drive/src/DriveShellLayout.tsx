import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import {
  Menu,
  Search,
  Star,
  Users,
  Folder,
  Home,
  Clock,
  Upload,
  CloudOff,
  Trash2,
  Ban,
  Settings,
  LogOut,
  User,
  X,
} from 'lucide-react'
import { useAuth } from '@cloudity/web-shell/authContext'
import { AppPageChromeProvider } from '@cloudity/web-shell/appPageChromeContext'
import { NotificationsProvider } from '@cloudity/web-shell/notificationsContext'
import { UploadProvider, DriveUploadInputs } from '@cloudity/web-shell/UploadProvider'
import { fetchDriveStorageSummary } from '@cloudity/web-shell/api'

/** Enveloppe affichée (style Google Drive 15 Go) tant que l’API n’expose pas de plafond. */
const DRIVE_DISPLAY_QUOTA_BYTES = 15 * 1024 * 1024 * 1024

function formatGo(bytes: number): string {
  const go = bytes / (1024 * 1024 * 1024)
  if (go < 0.01) return `${(bytes / (1024 * 1024)).toFixed(0)} Mo`
  return `${go.toLocaleString('fr-FR', { maximumFractionDigits: go >= 10 ? 0 : 1 })} Go`
}

const BOTTOM_TABS = [
  { view: 'home', label: 'Accueil', icon: Home },
  { view: 'starred', label: 'Favoris', icon: Star },
  { view: 'shared', label: 'Partagés', icon: Users },
  { view: 'files', label: 'Fichiers', icon: Folder },
] as const

const DRAWER_ITEMS = [
  { view: 'recent', label: 'Récents', icon: Clock },
  { view: 'imports', label: 'Importations', icon: Upload },
  { view: 'offline', label: 'Hors connexion', icon: CloudOff },
  { view: 'trash', label: 'Corbeille', icon: Trash2 },
  { view: 'spam', label: 'Spam', icon: Ban },
  { view: 'settings', label: 'Paramètres', icon: Settings },
] as const

function currentView(params: URLSearchParams): string {
  const v = (params.get('view') || '').trim()
  if (!v || v === 'home') return 'home'
  if (v === 'drive') return 'files'
  return v
}

export default function DriveShellLayout() {
  const { email, logout, accessToken } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get('q') ?? '')
  const [usedBytes, setUsedBytes] = useState<number | null>(null)
  const view = currentView(searchParams)
  const initial = (email || 'U').trim().charAt(0).toUpperCase()

  useEffect(() => {
    if (!searchParams.get('view')) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('view', 'home')
          return n
        },
        { replace: true }
      )
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    setSearchDraft(searchParams.get('q') ?? '')
  }, [searchParams])

  const goView = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams()
          n.set('view', next === 'files' ? 'files' : next)
          const q = prev.get('q')
          if (q && next === 'files') n.set('q', q)
          return n
        },
        { replace: true }
      )
      setDrawerOpen(false)
      setAccountOpen(false)
    },
    [setSearchParams]
  )

  const submitSearch = useCallback(
    (raw: string) => {
      const q = raw.trim()
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('view', 'files')
          if (q) n.set('q', q)
          else n.delete('q')
          return n
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  useEffect(() => {
    const t = setTimeout(() => {
      const q = searchDraft.trim()
      const current = (searchParams.get('q') ?? '').trim()
      if (q === current) return
      if (!q && !current) return
      submitSearch(searchDraft)
    }, 400)
    return () => clearTimeout(t)
  }, [searchDraft, searchParams, submitSearch])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    fetchDriveStorageSummary(accessToken)
      .then((s) => {
        if (!cancelled) setUsedBytes((s.drive?.bytes ?? 0) + (s.photos?.bytes ?? 0))
      })
      .catch(() => {
        if (!cancelled) setUsedBytes(null)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const quotaLabel = useMemo(() => {
    if (usedBytes == null) return 'Quota…'
    return `${formatGo(usedBytes)} utilisés / ${formatGo(DRIVE_DISPLAY_QUOTA_BYTES)}`
  }, [usedBytes])
  const quotaPct = useMemo(() => {
    if (usedBytes == null) return 0
    return Math.min(100, Math.round((usedBytes / DRIVE_DISPLAY_QUOTA_BYTES) * 100))
  }, [usedBytes])

  return (
    <NotificationsProvider>
      <UploadProvider>
        <DriveUploadInputs />
        <AppPageChromeProvider>
          <div className="flex h-dvh flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
            {drawerOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/40"
                aria-label="Fermer le menu"
                onClick={() => setDrawerOpen(false)}
              />
            ) : null}
            <aside
              className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-xl transition-transform ${
                drawerOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
              aria-hidden={!drawerOpen}
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <a href="/app" className="font-semibold truncate">
                  Hubera Drive
                </a>
                <button
                  type="button"
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Fermer le tiroir"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 space-y-0.5" aria-label="Menu Drive">
                {DRAWER_ITEMS.map((item) => {
                  const Icon = item.icon
                  const active = view === item.view
                  return (
                    <button
                      key={item.view}
                      type="button"
                      onClick={() => goView(item.view)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      {item.label}
                    </button>
                  )
                })}
              </nav>
              <div className="p-4 border-t border-slate-100 dark:border-slate-700 space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{quotaLabel}</p>
                <div
                  className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={quotaPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Quota Drive"
                >
                  <div className="h-full bg-blue-600 dark:bg-blue-400" style={{ width: `${quotaPct}%` }} />
                </div>
              </div>
            </aside>

            <header className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 px-3 py-2 flex items-center gap-2">
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => setDrawerOpen(true)}
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <form
                className="flex-1 min-w-0"
                onSubmit={(e) => {
                  e.preventDefault()
                  submitSearch(searchDraft)
                }}
              >
                <label className="flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-500 shrink-0" />
                  <input
                    type="search"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="Rechercher dans Drive"
                    aria-label="Rechercher dans Drive"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </label>
              </form>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setAccountOpen((v) => !v)}
                  className="h-9 w-9 rounded-full bg-blue-600 text-white text-sm font-semibold"
                  aria-label="Compte"
                  title={email || 'Compte'}
                >
                  {initial}
                </button>
                {accountOpen ? (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-2 z-30">
                    {email ? (
                      <p className="px-3 pb-2 text-xs text-slate-500 truncate" title={email}>
                        {email}
                      </p>
                    ) : null}
                    <a
                      href="/app/settings"
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <User className="h-4 w-4" />
                      Compte
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        logout()
                        window.location.assign('/login?next=' + encodeURIComponent('/app/drive/'))
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <LogOut className="h-4 w-4" />
                      Déconnexion
                    </button>
                  </div>
                ) : null}
              </div>
            </header>

            <main className="flex-1 min-h-0 overflow-auto p-3 md:p-4 pb-24">
              <Outlet />
            </main>

            <nav
              className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] grid grid-cols-4"
              aria-label="Navigation Drive"
            >
              {BOTTOM_TABS.map((tab) => {
                const Icon = tab.icon
                const active = view === tab.view || (tab.view === 'files' && view === 'drive')
                return (
                  <button
                    key={tab.view}
                    type="button"
                    onClick={() => goView(tab.view)}
                    className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[11px] font-medium ${
                      active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'fill-current/20' : ''}`} />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </AppPageChromeProvider>
      </UploadProvider>
    </NotificationsProvider>
  )
}
