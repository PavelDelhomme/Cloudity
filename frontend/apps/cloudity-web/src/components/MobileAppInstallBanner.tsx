import React, { useEffect, useState } from 'react'
import { Download, Smartphone, X } from 'lucide-react'
import {
  dismissMobileOtaPrompt,
  fetchPublicMobileOtaManifest,
  isAndroidMobileBrowser,
  isMobileOtaPromptDismissed,
  isStandaloneDisplayMode,
  type MobileOtaAppMeta,
  type MobileOtaManifest,
} from '../lib/mobileOtaPrompt'

type Props = {
  /** App cible (déduite de ?next= ou du chemin courant). */
  app: MobileOtaAppMeta | null
  className?: string
}

export function MobileAppInstallBanner({ app, className = '' }: Props) {
  const [manifest, setManifest] = useState<MobileOtaManifest | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)

  const eligible =
    Boolean(app) &&
    isAndroidMobileBrowser() &&
    !isStandaloneDisplayMode() &&
    !dismissed &&
    !isMobileOtaPromptDismissed(app!.slug)

  useEffect(() => {
    if (!eligible || !app) {
      setManifest(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    void fetchPublicMobileOtaManifest(app.slug, ac.signal)
      .then((m) => {
        if (!ac.signal.aborted) setManifest(m)
      })
      .catch(() => {
        if (!ac.signal.aborted) setManifest(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [app, eligible])

  if (!eligible || !app) return null
  if (!loading && !manifest) return null

  const handleDismiss = () => {
    dismissMobileOtaPrompt(app.slug)
    setDismissed(true)
  }

  return (
    <div
      className={`mb-6 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-slate-900/60 p-4 shadow-sm ${className}`}
      role="region"
      aria-label={`Installer l’application ${app.label}`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-600 p-2 text-white shrink-0">
          <Smartphone className="w-5 h-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Installer Cloudity {app.label} sur Android
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {loading
              ? 'Recherche d’une version Android…'
              : manifest
                ? `Version ${manifest.version} disponible. Télécharge l’APK, autorise l’installation depuis le navigateur, puis connecte-toi avec ton compte Cloudity.`
                : null}
          </p>
          {manifest ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={manifest.apk_url}
                download
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Download className="w-4 h-4" aria-hidden />
                Télécharger l’APK
              </a>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 underline underline-offset-2"
              >
                Continuer sur le web
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label="Masquer la suggestion"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
