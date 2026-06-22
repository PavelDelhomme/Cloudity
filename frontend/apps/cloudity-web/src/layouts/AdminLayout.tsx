import React, { useEffect } from 'react'
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
  Shield,
  Key,
  Palette,
} from 'lucide-react'
import { useAuth } from '../authContext'
import { ADMIN_UI_BASE_PATH, adminUiPath } from '@cloudity/shared'
import { ResponsiveShell } from '@cloudity/ui'

const adminNav = [
  { key: 'dashboard', name: 'Tableau de bord', href: adminUiPath(), icon: <LayoutDashboard className="w-4 h-4 shrink-0" />, end: true },
  { key: 'tenants', name: 'Tenants', href: adminUiPath('tenants'), icon: <Building2 className="w-4 h-4 shrink-0" /> },
  { key: 'users', name: 'Utilisateurs', href: adminUiPath('users'), icon: <Users className="w-4 h-4 shrink-0" /> },
  { key: 'vaults', name: 'Coffres (Pass)', href: adminUiPath('vaults'), icon: <Lock className="w-4 h-4 shrink-0" /> },
  { key: 'domaines', name: 'Domaines mail', href: adminUiPath('domaines'), icon: <Mail className="w-4 h-4 shrink-0" /> },
  { key: 'cve', name: 'CVE / dépendances', href: adminUiPath('securite-cve'), icon: <Shield className="w-4 h-4 shrink-0" /> },
  { key: 'passkeys', name: 'Passkeys', href: adminUiPath('passkeys'), icon: <Key className="w-4 h-4 shrink-0" /> },
  { key: 'settings', name: 'Paramètres', href: adminUiPath('settings'), icon: <Settings className="w-4 h-4 shrink-0" /> },
  { key: 'ui', name: 'Catalogue UI', href: adminUiPath('dev/ui'), icon: <Palette className="w-4 h-4 shrink-0" /> },
] as const

/** Titre d'onglet back-office : « Tenants — Cloudity — admin@… » (exporté pour les tests). */
export function buildAdminDocumentTitle(
  pathname: string,
  email: string | null | undefined
): string {
  const base = ADMIN_UI_BASE_PATH.replace(/\/+$/, '')
  const path = pathname.replace(/\/+$/, '') || base
  const onDashboard = path === base
  let section = 'Administration'
  if (!onDashboard) {
    const item = [...adminNav]
      .filter((n) => !n.end)
      .sort((a, b) => b.href.length - a.href.length)
      .find((n) => path.startsWith(n.href.replace(/\/+$/, '')))
    if (item) section = item.name
  }
  const parts = [section, 'Cloudity']
  const account = email?.trim()
  if (account) parts.push(account)
  return parts.join(' — ')
}

export default function AdminLayout() {
  const location = useLocation()
  const { logout, email } = useAuth()

  useEffect(() => {
    document.title = buildAdminDocumentTitle(location.pathname, email)
  }, [location.pathname, email])

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
      active
        ? 'bg-blue-600 dark:bg-blue-500 text-white'
        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
    }`

  return (
    <ResponsiveShell
      brandTitle="Cloudity"
      brandSubtitle="Administration"
      brandLink={
        <Link to={ADMIN_UI_BASE_PATH} className="text-base font-semibold text-gray-900 dark:text-slate-100">
          Cloudity
        </Link>
      }
      pathname={location.pathname}
      navItems={adminNav.map((item) => ({
        key: item.key,
        label: item.name,
        href: item.href,
        icon: item.icon,
        end: item.end,
      }))}
      renderNavLink={(item, { active, onNavigate }) => (
        <Link
          key={item.key}
          to={item.href}
          onClick={() => onNavigate?.()}
          className={navLinkClass(active)}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </Link>
      )}
      footerItems={[
        {
          key: 'back',
          label: 'Retour à l’app',
          icon: <ArrowLeft className="w-4 h-4" />,
          onClick: () => window.location.assign('/app'),
        },
        {
          key: 'logout',
          label: 'Déconnexion',
          icon: <LogOut className="w-4 h-4" />,
          onClick: logout,
        },
      ]}
      mainClassName="p-4 sm:p-6"
    >
      <Outlet />
    </ResponsiveShell>
  )
}
