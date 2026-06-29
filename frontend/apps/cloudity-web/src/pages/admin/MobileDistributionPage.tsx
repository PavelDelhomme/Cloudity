import React from 'react'
import { Link } from 'react-router-dom'
import { Smartphone, Package, GitBranch, FileJson } from 'lucide-react'
import { Card, PageLayout } from '@cloudity/ui'

const MOBILE_APPS = [
  { id: 'cloudity-mail', label: 'Mail', manifest: 'version-mail.json' },
  { id: 'cloudity-drive', label: 'Drive', manifest: 'version-drive.json' },
  { id: 'cloudity-photos', label: 'Photos', manifest: 'version-photos.json' },
  { id: 'cloudity-pass', label: 'Pass', manifest: 'version-pass.json' },
] as const

const CI_CHECKLIST = [
  'Job GHA : build APK signé + calcul SHA-256 après tag v*.*.*',
  'Upload artefact vers bucket HTTPS ou GHCR (APK en release asset)',
  'Bump manifeste version.json (app, version, min_supported, apk_url, sha256)',
  'Notification in-app au démarrage si version distante > installée',
  'Rollback : conserver N-1 APK + manifeste précédent',
] as const

export default function MobileDistributionPage() {
  return (
    <PageLayout
      title="Distribution mobile & OTA"
      description="Canal de mise à jour hors store (Android) — manifestes, CI et déploiement par app."
    >
      <Card className="p-4 mb-4 border-brand-200 dark:border-brand-800/50 bg-brand-50/30 dark:bg-brand-950/20">
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          Documentation complète :{' '}
          <a
            href="https://github.com/pactivisme/Cloudity/blob/main/docs/operations/RELEASE-AND-DISTRIBUTION.md"
            className="text-brand-600 dark:text-brand-400 underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            RELEASE-AND-DISTRIBUTION.md
          </a>
          {' '}·{' '}
          <a
            href="https://github.com/pactivisme/Cloudity/blob/main/docs/operations/DEPLOIEMENT-SUIVI.md"
            className="text-brand-600 dark:text-brand-400 underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            DEPLOIEMENT-SUIVI.md
          </a>
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {MOBILE_APPS.map((app) => (
          <Card key={app.id} className="p-5">
            <div className="flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{app.label}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">{app.id}</p>
                <dl className="mt-3 text-sm space-y-2">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <FileJson className="w-3.5 h-3.5" /> Manifeste cible
                    </dt>
                    <dd className="font-mono text-xs mt-0.5 text-slate-800 dark:text-slate-200">{app.manifest}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Statut CI</dt>
                    <dd className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">☐ Pipeline manifeste + upload APK à brancher</dd>
                  </div>
                </dl>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Checklist CI/CD (REL-OTA)</h3>
        </div>
        <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-2 list-disc list-inside">
          {CI_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Script suggéré :{' '}
          <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">scripts/ci/publish-mobile-manifest.sh</code>{' '}
          (à créer) — ingère le SHA-256 et la version depuis{' '}
          <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">pubspec.yaml</code> / build Flutter.
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Exemple manifeste</h3>
        </div>
        <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
{`{
  "app": "cloudity-mail",
  "version": "1.0.0+1",
  "min_supported": "1.0.0+1",
  "apk_url": "https://releases.example.com/cloudity-mail-1.0.0.apk",
  "sha256": "…"
}`}
        </pre>
      </Card>

      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
        Paramètres personnels (passkeys, session) :{' '}
        <Link to="/app/settings" className="text-brand-600 dark:text-brand-400 hover:underline">
          Paramètres app utilisateur
        </Link>
      </p>
    </PageLayout>
  )
}
