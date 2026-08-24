import React, { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import {
  HardDrive,
  Lock,
  Mail,
  Calendar,
  FileText,
  ListTodo,
  LayoutDashboard,
  User,
  LogOut,
  FileSpreadsheet,
  Users,
  Image,
  Menu,
  X,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@cloudity/web-shell/authContext'
import { AppPageChromeProvider } from '@cloudity/web-shell/appPageChromeContext'
import { NotificationsProvider } from '@cloudity/web-shell/notificationsContext'

/** Nav shell Mail SPA : liens pleine page vers le hub (autres apps = cloudity-web). */
const nav = [
  { name: 'Tableau de bord', href: '/app', icon: LayoutDashboard },
  { name: 'Drive', href: '/app/drive/', icon: HardDrive },
  { name: 'Corbeille', href: '/app/drive/?view=trash', icon: Trash2 },
  { name: 'Office', href: '/app/office', icon: FileSpreadsheet },
  { name: 'Pass', href: '/app/pass', icon: Lock },
  { name: 'Mail', href: '/app/mail/', icon: Mail, current: true },
  { name: 'Calendar', href: '/app/calendar', icon: Calendar },
  { name: 'Notes', href: '/app/notes', icon: FileText },
  { name: 'Tasks', href: '/app/tasks', icon: ListTodo },
  { name: 'Contacts', href: '/app/contacts', icon: Users },
  { name: 'Photos', href: '/app/photos', icon: Image },
] as const

/**
 * Layout léger pour la SPA Mail autonome (FE-SPLIT-01).
 * Pas de React Router Link vers /app/* (sinon basename /app/mail casse les URLs).
 */
export default function MailShellLayout() {
  const { email, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)

  return (
    <NotificationsProvider>
      <AppPageChromeProvider>
        <div className="flex h-dvh bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          <aside
            className={`bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shrink-0 transition-all ${
              open ? 'w-56' : 'w-14'
            }`}
          >
            <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
              <a href="/app" className={`font-semibold truncate ${open ? '' : 'sr-only'}`}>
                Cloudity
              </a>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? 'Replier le menu' : 'Ouvrir le menu'}
              >
                {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {nav.map((item) => {
                const Icon = item.icon
                const current = 'current' in item && item.current
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${
                      current
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title={item.name}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {open ? <span className="truncate">{item.name}</span> : null}
                  </a>
                )
              })}
            </nav>
            <div className="p-2 border-t border-slate-100 dark:border-slate-700 space-y-1">
              {open && email ? (
                <p className="px-3 text-xs text-slate-500 truncate" title={email}>
                  {email}
                </p>
              ) : null}
              <a
                href="/app/settings"
                className="flex items-center gap-2 px-3 py-2 rounded text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <User className="w-4 h-4" />
                {open ? <span>Profil</span> : null}
              </a>
              <button
                type="button"
                onClick={() => {
                  logout()
                  window.location.assign('/login?next=' + encodeURIComponent('/app/mail/'))
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <LogOut className="w-4 h-4" />
                {open ? <span>Déconnexion</span> : null}
              </button>
            </div>
          </aside>
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <header className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-4 py-2 flex items-center gap-2">
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                onClick={() => navigate('/')}
              >
                Mail
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-auto p-3 md:p-4">
              <Outlet />
            </div>
          </main>
        </div>
      </AppPageChromeProvider>
    </NotificationsProvider>
  )
}
