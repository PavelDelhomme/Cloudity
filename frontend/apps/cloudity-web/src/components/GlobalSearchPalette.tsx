import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { HardDrive, Search, Users, X } from 'lucide-react'

/**
 * Entrée de recherche « globale » : même zone que les notifications (web),
 * à rapprocher d’une icône loupe en barre d’app sur mobile Drive (champ ou bottom sheet).
 */
export default function GlobalSearchPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const q = new URLSearchParams(location.search).get('q')
    setQuery(q != null && q !== '' ? q : '')
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open, location.search])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (!(e.key === 'k' || e.key === 'K')) return
      if (!(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return
      }
      e.preventDefault()
      setOpen((v) => !v)
    }
    document.addEventListener('keydown', onShortcut)
    return () => document.removeEventListener('keydown', onShortcut)
  }, [])

  const runDriveSearch = useCallback(() => {
    const trimmed = query.trim()
    const sp = new URLSearchParams()
    if (trimmed) sp.set('q', trimmed)
    navigate({ pathname: '/app/drive', search: sp.toString() ? `?${sp.toString()}` : '' })
    close()
  }, [navigate, query, close])

  const runContactsSearch = useCallback(() => {
    const trimmed = query.trim()
    const sp = new URLSearchParams()
    if (trimmed) sp.set('q', trimmed)
    navigate({ pathname: '/app/contacts', search: sp.toString() ? `?${sp.toString()}` : '' })
    close()
  }, [navigate, query, close])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runDriveSearch()
  }

  const modal =
    open &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[min(20vh,8rem)] px-4 bg-black/40 dark:bg-black/60"
        role="presentation"
        onMouseDown={(ev) => {
          if (ev.target === ev.currentTarget) close()
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-search-title"
          className="w-full max-w-lg rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-2xl overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <h2 id="global-search-title" className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Recherche
            </h2>
            <button
              type="button"
              onClick={close}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={onSubmit} className="p-4 space-y-4">
            <div>
              <label htmlFor="global-search-input" className="sr-only">
                Terme à rechercher
              </label>
              <input
                ref={inputRef}
                id="global-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom de fichier ou dossier (tout le Drive)…"
                className="w-full rounded-lg border border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600"
              >
                <HardDrive className="h-4 w-4 shrink-0" />
                Ouvrir le Drive{query.trim() ? ' (recherche)' : ''}
              </button>
              <button
                type="button"
                onClick={runContactsSearch}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <Users className="h-4 w-4 shrink-0" />
                Ouvrir Contacts
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
              Avec un terme, le Drive interroge <strong className="font-medium text-gray-700 dark:text-slate-300">tout votre espace</strong> (recherche par nom côté serveur). Sans terme, vous ouvrez simplement la racine Drive. Sur mobile, prévoir la même icône (barre du haut) puis un flux équivalent.
            </p>
          </form>
        </div>
      </div>,
      document.body
    )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-200"
        aria-label="Ouvrir la recherche (Ctrl+K)"
        title="Recherche (Ctrl+K)"
      >
        <Search className="h-5 w-5" />
      </button>
      {modal}
    </>
  )
}
