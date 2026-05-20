import React, { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'

export type ResponsiveShellNavItem = {
  key: string
  label: string
  href: string
  icon?: React.ReactNode
  end?: boolean
  onNavigate?: () => void
}

export type ResponsiveShellFooterItem = {
  key: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  href?: string
  external?: boolean
}

type ResponsiveShellProps = {
  brandTitle: string
  brandSubtitle?: string
  brandHref?: string
  brandLink?: React.ReactNode
  navItems: ResponsiveShellNavItem[]
  footerItems?: ResponsiveShellFooterItem[]
  children: React.ReactNode
  sidebarWidthClassName?: string
  mainClassName?: string
  header?: React.ReactNode
  closeOnNavigate?: boolean
  /** Chemin courant (ex. React Router) pour l’état actif de la navigation. */
  pathname?: string
  /** Rendu personnalisé d’un lien de navigation (SPA, NavLink, etc.). */
  renderNavLink?: (item: ResponsiveShellNavItem, ctx: { active: boolean; onNavigate?: () => void }) => React.ReactNode
}

function isActivePath(pathname: string, href: string, end = false) {
  return end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

export function ResponsiveShell({
  brandTitle,
  brandSubtitle,
  brandHref,
  brandLink,
  navItems,
  footerItems = [],
  children,
  sidebarWidthClassName = 'w-56',
  mainClassName = '',
  header,
  closeOnNavigate = true,
  pathname,
  renderNavLink,
}: ResponsiveShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const currentPath = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const closeMobile = () => setMobileOpen(false)

  const renderNavItem = (item: ResponsiveShellNavItem, onNavigate?: () => void) => {
    const active = isActivePath(currentPath, item.href, item.end)
    if (renderNavLink) {
      return <React.Fragment key={item.key}>{renderNavLink(item, { active, onNavigate })}</React.Fragment>
    }
    const className = `flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
      active
        ? 'bg-blue-600 dark:bg-blue-500 text-white'
        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
    }`
    const content = (
      <>
        {item.icon}
        <span className="truncate">{item.label}</span>
      </>
    )
    if (item.onNavigate) {
      return (
        <button key={item.key} type="button" onClick={() => { item.onNavigate(); onNavigate?.() }} className={`w-full text-left ${className}`}>
          {content}
        </button>
      )
    }
    return (
      <a key={item.key} href={item.href} onClick={() => { item.onNavigate?.(); onNavigate?.() }} className={className}>
        {content}
      </a>
    )
  }

  const renderFooterItem = (item: ResponsiveShellFooterItem) => {
    const className =
      'flex items-center gap-2 w-full px-3 py-2 rounded text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
    if (item.href) {
      return (
        <a
          key={item.key}
          href={item.href}
          className={className}
          {...(item.external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {item.icon}
          {item.label}
        </a>
      )
    }
    return (
      <button key={item.key} type="button" onClick={item.onClick} className={className}>
        {item.icon}
        {item.label}
      </button>
    )
  }

  const sidebar = (
    <aside
      className={`${sidebarWidthClassName} min-h-0 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col shrink-0 overflow-hidden`}
    >
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
        {brandLink ? (
          brandLink
        ) : brandHref ? (
          <a href={brandHref} className="text-base font-semibold text-gray-900 dark:text-slate-100">
            {brandTitle}
          </a>
        ) : (
          <p className="text-base font-semibold text-gray-900 dark:text-slate-100">{brandTitle}</p>
        )}
        {brandSubtitle ? <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{brandSubtitle}</p> : null}
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-0.5">
        {navItems.map((item) => renderNavItem(item, closeOnNavigate ? closeMobile : undefined))}
      </nav>
      {footerItems.length > 0 ? (
        <div className="p-2 border-t border-gray-200 dark:border-slate-700 space-y-0.5 shrink-0">
          {footerItems.map(renderFooterItem)}
        </div>
      ) : null}
    </aside>
  )

  return (
    <div className="h-dvh min-h-0 max-h-dvh overflow-hidden bg-gray-100 dark:bg-slate-900 flex">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeMobile}
        />
      ) : null}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex lg:hidden transform transition-transform duration-200 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebar}
      </div>
      <aside className="hidden lg:flex">{sidebar}</aside>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{brandTitle}</p>
            {brandSubtitle ? <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{brandSubtitle}</p> : null}
          </div>
          {mobileOpen ? (
            <button
              type="button"
              onClick={closeMobile}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        {header ? <div className="shrink-0 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">{header}</div> : null}
        <main className={`flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-y-contain ${mainClassName}`}>{children}</main>
      </div>
    </div>
  )
}
