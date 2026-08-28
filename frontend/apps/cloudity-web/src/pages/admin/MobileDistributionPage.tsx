import React, { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Smartphone,
  Package,
  Server,
  Globe,
  RefreshCw,
  Upload,
  PauseCircle,
  PlayCircle,
  ExternalLink,
  Shield,
} from 'lucide-react'
import { Card, PageLayout } from '@cloudity/ui'
import { useAuth } from '../../authContext'
import {
  fetchMobileOTAReleases,
  holdMobileOTARelease,
  uploadMobileOTAApk,
  type MobileOTAReleaseEntry,
} from '../../api'

const WEB_BACKEND_MATRIX = [
  {
    bloc: 'Plateforme',
    items: [
      { name: 'api-gateway', image: 'cloudity-api-gateway', note: 'Routes API + OTA' },
      { name: 'auth-service', image: 'cloudity-auth-service', note: 'JWT / login' },
      { name: 'admin-service', image: 'cloudity-admin-service', note: 'Back-office API' },
      { name: 'mail-directory', image: 'cloudity-mail-directory-service', note: 'Alias / MTA' },
    ],
  },
  {
    bloc: 'Produit (API)',
    items: [
      { name: 'passwords', image: 'cloudity-passwords-service', note: 'Pass' },
      { name: 'drive', image: 'cloudity-drive-service', note: 'Drive' },
      { name: 'photos', image: 'cloudity-photos-service', note: 'Photos' },
      { name: 'calendar', image: 'cloudity-calendar-service', note: 'Agenda' },
      { name: 'notes', image: 'cloudity-notes-service', note: 'Notes' },
      { name: 'tasks', image: 'cloudity-tasks-service', note: 'Tâches' },
      { name: 'contacts', image: 'cloudity-contacts-service', note: 'Contacts' },
    ],
  },
  {
    bloc: 'Web',
    items: [
      {
        name: 'cloudity-web',
        image: 'cloudity-frontend',
        note: 'Shell + /app/mail + /app/drive + admin.html',
      },
    ],
  },
] as const

function ReleaseRow({
  entry,
  onHold,
  holding,
}: {
  entry: MobileOTAReleaseEntry
  onHold: (held: boolean) => void
  holding: boolean
}) {
  const rel = entry.release
  return (
    <tr className="border-t border-slate-200 dark:border-slate-700">
      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{entry.label}</td>
      <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{entry.app}</td>
      <td className="px-3 py-2 font-mono text-sm">{rel?.version ?? '—'}</td>
      <td className="px-3 py-2 text-xs">
        {rel?.held ? (
          <span className="text-amber-600 dark:text-amber-400">hold</span>
        ) : rel ? (
          <span className="text-emerald-600 dark:text-emerald-400">live</span>
        ) : (
          <span className="text-slate-400">aucune</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{rel?.published_at?.slice(0, 19) ?? '—'}</td>
      <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
        {rel?.apk_url ? (
          <a
            href={rel.apk_url}
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            APK <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
        {rel ? (
          <button
            type="button"
            disabled={holding}
            onClick={() => onHold(!rel.held)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {rel.held ? (
              <>
                <PlayCircle className="w-3.5 h-3.5" /> Publier
              </>
            ) : (
              <>
                <PauseCircle className="w-3.5 h-3.5" /> Hold
              </>
            )}
          </button>
        ) : null}
      </td>
    </tr>
  )
}

export default function MobileDistributionPage() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [app, setApp] = useState('cloudity_mail')
  const [version, setVersion] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const releasesQ = useQuery({
    queryKey: ['mobile-ota-releases'],
    queryFn: () => fetchMobileOTAReleases(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 30_000,
  })

  const holdMut = useMutation({
    mutationFn: ({ appSlug, held }: { appSlug: string; held: boolean }) =>
      holdMobileOTARelease(accessToken!, appSlug, held),
    onSuccess: () => {
      toast.success('Release mise à jour')
      void qc.invalidateQueries({ queryKey: ['mobile-ota-releases'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const uploadMut = useMutation({
    mutationFn: () => {
      if (!file || !version.trim()) throw new Error('Fichier APK + version requis')
      return uploadMobileOTAApk(accessToken!, {
        app,
        version: version.trim(),
        file,
      })
    },
    onSuccess: (m) => {
      toast.success(`Publié ${m.app} ${m.version}`)
      setFile(null)
      setVersion('')
      if (fileRef.current) fileRef.current.value = ''
      void qc.invalidateQueries({ queryKey: ['mobile-ota-releases'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const appOptions = useMemo(() => {
    const fromApi = releasesQ.data?.releases.map((r) => ({ value: r.app, label: r.label })) ?? []
    if (fromApi.length) return fromApi
    return [
      { value: 'cloudity_mail', label: 'Mail' },
      { value: 'cloudity_drive', label: 'Drive' },
      { value: 'cloudity_photos', label: 'Photos' },
      { value: 'cloudity_pass', label: 'Pass' },
      { value: 'cloudity_calendar', label: 'Agenda' },
      { value: 'cloudity_contacts', label: 'Contacts' },
      { value: 'cloudity_notes', label: 'Notes' },
      { value: 'cloudity_tasks', label: 'Tâches' },
    ]
  }, [releasesQ.data])

  return (
    <PageLayout
      title="Déploiements & OTA"
      description="Web + backends via GitOps/Watchtower · APK Android via URL HTTPS sécurisée (toutes les apps)."
    >
      <Card className="p-4 mb-4 border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700 dark:text-slate-200 space-y-2">
            <p>
              <strong>Depuis cette UI (prod)</strong> : publier / hold les APK mobiles, voir les versions
              live. Les apps Flutter interrogent{' '}
              <code className="text-xs bg-white/60 dark:bg-slate-900 px-1 rounded">
                GET /deploy/mobile/manifest?app=…
              </code>{' '}
              au login.
            </p>
            <p>
              <strong>Web + tous les backends</strong> (gateway, auth, calendar, drive, notes, pass,
              photos, tasks, contacts, mail-directory, frontend) : depuis ta machine de{' '}
              <strong>dev</strong> — pas depuis le navigateur seul :
            </p>
            <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">
{`make push-prod REF=prod WAIT=1
# ou
make admin-deploy-prod MODE=web
# → GHCR :latest → Portainer GitOps (~5 min) + Watchtower`}
            </pre>
            <p className="text-xs text-slate-500">
              Doc : <code>docs/operations/DEPLOY-MATRIX.md</code> ·{' '}
              <code>DISTRIBUTION-CHANNELS.md</code> · <code>MOBILES.md</code> § 7            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        {WEB_BACKEND_MATRIX.map((bloc) => (
          <Card key={bloc.bloc} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {bloc.bloc === 'Web' ? (
                <Globe className="w-4 h-4 text-slate-500" />
              ) : (
                <Server className="w-4 h-4 text-slate-500" />
              )}
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{bloc.bloc}</h3>
            </div>
            <ul className="space-y-2 text-sm">
              {bloc.items.map((it) => (
                <li key={it.name} className="flex flex-col gap-0.5">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{it.name}</span>
                  <span className="font-mono text-[11px] text-slate-500">{it.image}:latest</span>
                  <span className="text-xs text-slate-500">{it.note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400">
              Auto après push <code>prod</code> (GitOps + Watchtower)
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Releases OTA Android (toutes apps)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void releasesQ.refetch()}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${releasesQ.isFetching ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>

        {releasesQ.isError ? (
          <p className="text-sm text-red-600">
            {(releasesQ.error as Error).message} — vérifie que la gateway a l’image OTA à jour.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">App</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2">Publié</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(releasesQ.data?.releases ?? []).map((entry) => (
                <ReleaseRow
                  key={entry.app}
                  entry={entry}
                  holding={holdMut.isPending}
                  onHold={(held) => holdMut.mutate({ appSlug: entry.app, held })}
                />
              ))}
              {!releasesQ.data?.releases?.length && !releasesQ.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Aucune release — uploade une APK ci-dessous ou{' '}
                    <code className="text-xs">make mobile-upload-apk APP=Mail</code>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {releasesQ.data?.public_base ? (
          <p className="mt-2 text-xs text-slate-500 font-mono">
            Base publique : {releasesQ.data.public_base}
          </p>
        ) : null}
      </Card>

      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Upload className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Publier une APK (navigateur)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="text-sm space-y-1">
            <span className="text-slate-600 dark:text-slate-300">Application</span>
            <select
              value={app}
              onChange={(e) => setApp(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              {appOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.value})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="text-slate-600 dark:text-slate-300">Version</span>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="0.1.1"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="text-sm space-y-1 md:col-span-2">
            <span className="text-slate-600 dark:text-slate-300">Fichier .apk</span>
            <input
              ref={fileRef}
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={uploadMut.isPending || !file || !version.trim()}
          onClick={() => uploadMut.mutate()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Package className="w-4 h-4" />
          {uploadMut.isPending ? 'Upload…' : 'Publier OTA'}
        </button>
        <pre className="mt-4 text-xs bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">
{`# Depuis le PC de dev (toutes les apps ou une seule) :
export MOBILE_APK_UPLOAD_TOKEN=…   # même valeur que Portainer stack.env
DEPLOY_URL=https://api.cloudity.delhomme.ovh make mobile-upload-apk APP=Mail
DEPLOY_URL=https://api.cloudity.delhomme.ovh make mobile-upload-all`}
        </pre>
      </Card>
    </PageLayout>
  )
}
