import React from 'react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import {
  Building2,
  Settings,
  Users,
  LogOut,
  Lock,
  Mail,
  LayoutDashboard,
  ArrowLeft,
} from 'lucide-react'
import { useAuth } from '../authContext'

const adminNav = [
  { name: 'Tableau de bord', href: '/admin', icon: LayoutDashboard, end: true },
  { name: 'Tenants', href: '/admin/tenants', icon: Building2, end: false },
  { name: 'Utilisateurs', href: '/admin/users', icon: Users, end: false },
  { name: 'Coffres (Pass)', href: '/admin/vaults', icon: Lock, end: false },
  { name: 'Domaines mail', href: '/admin/domaines', icon: Mail, end: false },
  { name: 'Paramètres', href: '/admin/settings', icon: Settings, end: false },
]

export default function AdminLayout() {
  const location = useLocation()
  const { logout } = useAuth()

  const isActive = (href: string, end: boolean) =>
    end ? location.pathname === href : location.pathname.startsWith(href)

  return (
    <div className="h-dvh min-h-0 max-h-dvh overflow-hidden bg-gray-100 dark:bg-slate-900 flex">
      <aside className="w-56 min-h-0 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <Link to="/admin" className="text-base font-semibold text-gray-900 dark:text-slate-100">Cloudity</Link>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Administration</p>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-0.5">
          {adminNav.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.end)
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${
                  active
                    ? 'bg-blue-600 dark:bg-blue-500 text-white'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="p-2 border-t border-gray-200 dark:border-slate-700 space-y-0.5 shrink-0">
          <Link
            to="/app"
            className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à l’app
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
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-y-contain p-6">
        <Outlet />
      </main>
    </div>
  )
}
