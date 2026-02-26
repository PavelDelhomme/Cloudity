import React from 'react'
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
} from 'lucide-react'
import { useAuth } from '../authContext'
import { UploadProvider } from '../uploadContext'
import { UploadOverlay } from '../components/UploadOverlay'

const appNav = [
  { name: 'Tableau de bord', href: '/app', icon: LayoutDashboard, end: true },
  { name: 'Drive', href: '/app/drive', icon: HardDrive, end: false },
  { name: 'Office', href: '/app/office', icon: FileSpreadsheet, end: false },
  { name: 'Pass', href: '/app/pass', icon: Lock, end: false },
  { name: 'Mail', href: '/app/mail', icon: Mail, end: false },
  { name: 'Calendar', href: '/app/calendar', icon: Calendar, end: false },
  { name: 'Notes', href: '/app/notes', icon: FileText, end: false },
  { name: 'Tasks', href: '/app/tasks', icon: ListTodo, end: false },
  { name: 'Contacts', href: '/app/contacts', icon: Users, end: false },
  { name: 'Photos', href: '/app/photos', icon: Image, end: false },
]

export default function AppLayout() {
  const location = useLocation()
  const { email, logout } = useAuth()

  const isActive = (href: string, end: boolean) =>
    end ? location.pathname === href : location.pathname.startsWith(href)

  return (
    <UploadProvider>
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex">
      <aside className="w-56 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700">
          <Link to="/app" className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900 dark:text-slate-100">Cloudity</span>
          </Link>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Espace personnel</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {appNav.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.end)
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.name}
              </Link>
            )
          })}
          <div className="pt-2 mt-2 border-t border-gray-100 dark:border-slate-700">
            <a
              href="/admin"
              className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <Shield className="w-4 h-4 shrink-0" />
              Administration
              <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
            </a>
          </div>
        </nav>
        <div className="p-2 border-t border-gray-100 dark:border-slate-700 space-y-0.5">
          <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 truncate" title={email ?? ''}>
            {email ?? '—'}
          </div>
          <Link
            to="/app/settings"
            className="flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <Settings className="w-4 h-4" />
            Paramètres
          </Link>
            <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">
        <Outlet />
      </main>
      </div>
      <UploadOverlay />
    </UploadProvider>
  )
}
