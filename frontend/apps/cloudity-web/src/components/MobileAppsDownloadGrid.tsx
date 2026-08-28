import React, { useEffect, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'
import {
  fetchPublicMobileOtaManifest,
  isAndroidMobileBrowser,
  isStandaloneDisplayMode,
  MOBILE_OTA_CATALOG,
  type MobileOtaManifest,
} from '../lib/mobileOtaPrompt'

/** Grille d’APK Android sur l’accueil (visiteur non connecté, smartphone). */
export function MobileAppsDownloadGrid() {
  const [manifests, setManifests] = useState<Record<string, MobileOtaManifest | null>>({})
  const [loading, setLoading] = useState(true)

  const show = isAndroidMobileBrowser() && !isStandaloneDisplayMode()

  useEffect(() => {
    if (!show) return
    const ac = new AbortController()
    setLoading(true)
    void Promise.all(
      MOBILE_OTA_CATALOG.map(async (app) => {
        const m = await fetchPublicMobileOtaManifest(app.slug, ac.signal).catch(() => null)
        return [app.slug, m] as const
      })
    )
      .then((pairs) => {
        if (ac.signal.aborted) return
        const map: Record<string, MobileOtaManifest | null> = {}
        for (const [slug, m] of pairs) map[slug] = m
        setManifests(map)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [show])

  if (!show) return null

  const available = MOBILE_OTA_CATALOG.filter((a) => manifests[a.slug]?.apk_url)

  if (!loading && available.length === 0) return null

  return (
    <section className="mt-14 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Applications Android</h2>
      </div>
      <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
        Tu es sur un téléphone Android — tu peux installer une app Cloudity avant de te connecter.
      </p>
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-slate-500">Chargement des versions…</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {available.map((app) => {
            const m = manifests[app.slug]!
            return (
              <li key={app.slug}>
                <a
                  href={m.apk_url}
                  download
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm hover:border-blue-300 dark:hover:border-blue-700"
                >
                  <span>
                    <span className="font-medium text-gray-900 dark:text-slate-100">{app.label}</span>
                    <span className="ml-2 text-xs font-mono text-gray-500 dark:text-slate-500">v{m.version}</span>
                  </span>
                  <Download className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                </a>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-gray-500 dark:text-slate-500">
        Après installation, ouvre l’app et connecte-toi avec le même compte que sur le web.
      </p>
    </section>
  )
}
