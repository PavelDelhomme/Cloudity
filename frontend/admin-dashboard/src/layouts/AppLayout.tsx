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
} from 'lucide-react'
import { useAuth } from '../authContext'

const appNav = [
  { name: 'Tableau de bord', href: '/app', icon: LayoutDashboard, end: true },
  { name: 'Drive', href: '/app/drive', icon: HardDrive, end: false },
  { name: 'Pass', href: '/app/pass', icon: Lock, end: false },
  { name: 'Mail', href: '/app/mail', icon: Mail, end: false },
  { name: 'Calendar', href: '/app/calendar', icon: Calendar, end: false },
  { name: 'Notes', href: '/app/notes', icon: FileText, end: false },
  { name: 'Tasks', href: '/app/tasks', icon: ListTodo, end: false },
]

export default function AppLayout() {
  const location = useLocation()
  const { email, logout } = useAuth()

  const isActive = (href: string, end: boolean) =>
    end ? location.pathname === href : location.pathname.startsWith(href)

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100">
          <Link to="/app" className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">Cloudity</span>
          </Link>
          <p className="text-xs text-gray-500 mt-0.5">Espace personnel</p>
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
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.name}
              </Link>
            )
          })}
          <div className="pt-2 mt-2 border-t border-gray-100">
            <a
              href="/admin"
              className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <Shield className="w-4 h-4 shrink-0" />
              Administration
              <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
            </a>
          </div>
        </nav>
        <div className="p-2 border-t border-gray-100 space-y-0.5">
          <div className="px-3 py-1.5 text-xs text-gray-500 truncate" title={email ?? ''}>
            {email ?? '—'}
          </div>
          <Link
            to="/app/settings"
            className="flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
          >
            <Settings className="w-4 h-4" />
            Paramètres
          </Link>
            <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm font-medium text-gray-700 hover:bg-gray-100"
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
  )
}
