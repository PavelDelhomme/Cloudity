import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import {
  HardDrive,
  Lock,
  Mail,
  Calendar,
  FileText,
  ListTodo,
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronRight,
  Shield,
  FileSpreadsheet,
  Users,
  Image,
  Bell,
  Menu,
  X,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../authContext'
import { AppPageChromeProvider, BreadcrumbAppActionsSlot, ShellSearchAdjacentSlot } from '../appPageChromeContext'
import { UploadProvider, DriveUploadInputs } from '../UploadProvider'
import { UploadOverlay } from '../components/UploadOverlay'
import GlobalSearchPalette from '../components/GlobalSearchPalette'
import { NotificationsProvider, useNotifications } from '../notificationsContext'
import { formatRelativeDate } from '../utils/formatDate'

function NotificationBell() {
  const ctx = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [open])

  const unreadCount = ctx?.notifications.filter((n) => !n.read).length ?? 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-200"
        aria-label={unreadCount > 0 ? `${unreadCount} notification(s)` : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 max-h-[min(24rem,70vh)] overflow-auto rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-2">
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-slate-700">
            <span className="font-semibold text-sm text-gray-900 dark:text-slate-100">Notifications</span>
            {unreadCount > 0 && ctx && (
              <button
                type="button"
                onClick={() => { ctx.markAllAsRead(); setOpen(false) }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {ctx?.notifications.length ? (
              ctx.notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { ctx.markAsRead(n.id); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 ${!n.read ? 'bg-blue-50/50 dark:bg-slate-700/30' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">{formatRelativeDate(n.createdAt)}</p>
                </button>
              ))
            ) : (
              <p className="px-3 py-6 text-sm text-gray-500 dark:text-slate-400 text-center">Aucune notification</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const appNav = [
  { name: 'Tableau de bord', href: '/app', icon: LayoutDashboard, end: true },
  { name: 'Drive', href: '/app/drive', icon: HardDrive, end: false, subItem: { name: 'Corbeille', href: '/app/corbeille', icon: Trash2 } },
  { name: 'Office', href: '/app/office', icon: FileSpreadsheet, end: false },
  { name: 'Pass', href: '/app/pass', icon: Lock, end: false },
  { name: 'Mail', href: '/app/mail', icon: Mail, end: false },
  { name: 'Calendar', href: '/app/calendar', icon: Calendar, end: false },
  { name: 'Notes', href: '/app/notes', icon: FileText, end: false },
  { name: 'Tasks', href: '/app/tasks', icon: ListTodo, end: false },
  { name: 'Contacts', href: '/app/contacts', icon: Users, end: false },
  { name: 'Photos', href: '/app/photos', icon: Image, end: false },
] as const

/** Segments du fil d'Ariane pour la barre du haut (Tableau de bord > Section). Exporté pour les tests. */
export function getAppBreadcrumb(pathname: string, search?: string): { label: string; href: string | null }[] {
  const segments: { label: string; href: string | null }[] = [
    { label: 'Tableau de bord', href: '/app' },
  ]
  if (pathname === '/app' || pathname === '/app/') return segments
  if (/^\/app\/office\/editor\/\d+$/.test(pathname)) {
    segments.push({ label: 'Drive', href: '/app/drive' })
    return segments
  }
  if (pathname.startsWith('/app/corbeille')) {
    segments.push({ label: 'Drive', href: '/app/drive' })
    segments.push({ label: 'Corbeille', href: '/app/drive?view=trash' })
    return segments
  }
  if (pathname.startsWith('/app/drive')) {
    segments.push({ label: 'Drive', href: '/app/drive' })
    if (search?.includes('view=trash')) {
      segments.push({ label: 'Corbeille', href: '/app/drive?view=trash' })
    }
    return segments
  }
  if (pathname.startsWith('/app/settings')) {
    segments.push({ label: 'Paramètres', href: '/app/settings' })
    return segments
  }
  const section = appNav.find(
    (item) => item.href !== '/app' && (pathname === item.href || pathname.startsWith(item.href + '/'))
  )
  if (section) {
    segments.push({ label: section.name, href: section.href })
  } else {
    const second = pathname.split('/').filter(Boolean)[1]
    segments.push({ label: second ? second.charAt(0).toUpperCase() + second.slice(1) : 'App', href: null })
  }
  return segments
}

const SIDEBAR_STORAGE_KEY = 'cloudity_sidebar_visible'

function getInitialSidebarVisible(): boolean {
  if (typeof window === 'undefined') return true
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
  if (stored === 'false') return false
  if (stored === 'true') return true
  return true
}

export default function AppLayout() {
  const location = useLocation()
  const { email, logout } = useAuth()
  const isDrive = location.pathname.startsWith('/app/drive')
  const [driveInputsReady, setDriveInputsReady] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(getInitialSidebarVisible)

  const toggleSidebar = () => {
    setSidebarVisible((v) => {
      const next = !v
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      } catch (_) {}
      return next
    })
  }

  useEffect(() => {
    if (!isDrive) {
      setDriveInputsReady(false)
      return
    }
    const t = setTimeout(() => setDriveInputsReady(true), 150)
    return () => clearTimeout(t)
  }, [isDrive])

  const isActive = (href: string, end: boolean) =>
    end ? location.pathname === href : location.pathname.startsWith(href)

  return (
    <UploadProvider>
      {isDrive && driveInputsReady && <DriveUploadInputs />}
      <div className="h-dvh min-h-0 max-h-dvh overflow-hidden bg-gray-100 dark:bg-slate-900 flex">
      {/* Overlay mobile quand la sidebar est ouverte */}
      {sidebarVisible && (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarVisible(false)}
        />
      )}
      {/* Barre latérale : drawer repliable sur tous les écrans (état persisté en localStorage) */}
      <aside
        className={`
          bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col shrink-0 h-dvh md:h-auto md:min-h-0 md:self-stretch overflow-hidden
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto
          transform transition-all duration-200 ease-out
          ${sidebarVisible ? 'w-56 translate-x-0' : 'w-0 md:w-14 -translate-x-full md:translate-x-0 overflow-hidden md:overflow-visible'}
        `}
      >
        {/* Contenu complet de la sidebar (masqué quand repliée) */}
        <div className={`flex flex-col flex-1 min-h-0 shrink-0 ${sidebarVisible ? 'w-56 flex' : 'hidden'}`}>
          <div className="p-4 border-b border-gray-100 dark:border-slate-700 shrink-0">
            <Link to="/app" className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900 dark:text-slate-100 whitespace-nowrap">Cloudity</span>
            </Link>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">Espace personnel</p>
          </div>
          <nav className="flex-1 min-h-0 p-2 space-y-0.5 overflow-y-auto">
            {appNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href, item.end)
              const hasSub = 'subItem' in item && item.subItem
              const SubIcon = hasSub ? item.subItem.icon : null
              return (
                <div key={item.name}>
                  <Link
                    to={item.href}
                    onClick={() => setSidebarVisible(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${
                      active && !(hasSub && location.pathname.startsWith(item.subItem.href))
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                    title={!sidebarVisible ? item.name : undefined}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {sidebarVisible && <span className="whitespace-nowrap">{item.name}</span>}
                  </Link>
                  {hasSub && sidebarVisible && (
                    <Link
                      to={item.subItem.href}
                      onClick={() => setSidebarVisible(false)}
                      className={`flex items-center gap-2 pl-6 pr-3 py-1.5 rounded text-sm font-medium ${
                        isActive(item.subItem.href, true)
                          ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                      }`}
                      title={item.subItem.name}
                    >
                      {SubIcon && <SubIcon className="w-4 h-4 shrink-0" />}
                      <span className="whitespace-nowrap">{item.subItem.name}</span>
                    </Link>
                  )}
                </div>
              )
            })}
            <div className="pt-2 mt-2 border-t border-gray-100 dark:border-slate-700">
              <a
                href="/admin"
                onClick={() => setSidebarVisible(false)}
                className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                title={!sidebarVisible ? 'Administration' : undefined}
              >
                <Shield className="w-4 h-4 shrink-0" />
                {sidebarVisible && <><span className="whitespace-nowrap">Administration</span><ChevronRight className="w-4 h-4 ml-auto opacity-50" /></>}
              </a>
            </div>
          </nav>
          <div className="p-2 border-t border-gray-100 dark:border-slate-700 space-y-0.5 shrink-0 bg-gray-50/50 dark:bg-slate-800/80">
            {sidebarVisible && (
              <>
                <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Connecté</p>
                <div className="px-3 py-1 text-sm font-medium text-gray-800 dark:text-slate-200 truncate" title={email ?? ''}>
                  {email ?? '—'}
                </div>
              </>
            )}
            <Link
              to="/app/settings"
              onClick={() => setSidebarVisible(false)}
              className="flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              title={!sidebarVisible ? 'Paramètres' : undefined}
            >
              <Settings className="w-4 h-4 shrink-0" />
              {sidebarVisible && <span className="whitespace-nowrap">Paramètres</span>}
            </Link>
            <button
              type="button"
              onClick={() => { setSidebarVisible(false); logout() }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              title={!sidebarVisible ? 'Déconnexion' : undefined}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {sidebarVisible && <span className="whitespace-nowrap">Déconnexion</span>}
            </button>
          </div>
        </div>
        {/* Bouton pour rouvrir la sidebar quand elle est repliée (desktop) */}
        {!sidebarVisible && (
          <div className="hidden md:flex absolute inset-y-0 left-0 w-14 flex-col items-center justify-center border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-3 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-200"
              aria-label="Afficher le menu de navigation"
              title="Afficher le menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        )}
      </aside>
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <AppPageChromeProvider>
        <NotificationsProvider>
          <div className="shrink-0 flex items-center justify-between gap-4 py-2 px-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={toggleSidebar}
                className="p-2 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                aria-label={sidebarVisible ? 'Masquer le menu' : 'Afficher le menu'}
                title={sidebarVisible ? 'Masquer la barre latérale' : 'Afficher la barre latérale'}
              >
                {sidebarVisible ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <nav className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 flex-wrap" aria-label="Fil d'Ariane">
              {getAppBreadcrumb(location.pathname, location.search).map((seg, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-slate-500" />}
                  {seg.href ? (
                    <Link to={seg.href} className="font-medium text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100">
                      {seg.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900 dark:text-slate-100">{seg.label}</span>
                  )}
                </span>
              ))}
              </nav>
              <BreadcrumbAppActionsSlot />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <ShellSearchAdjacentSlot />
              <GlobalSearchPalette />
              <NotificationBell />
            </div>
          </div>
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain p-6">
            <Outlet />
          </div>
        </NotificationsProvider>
        </AppPageChromeProvider>
      </main>
      </div>
      <UploadOverlay />
    </UploadProvider>
  )
}
