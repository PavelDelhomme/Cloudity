import React from 'react'
import { Link } from 'react-router-dom'
import {
  HardDrive,
  Lock,
  Mail,
  Calendar,
  FileText,
  ListTodo,
  FileSpreadsheet,
  Users,
  Image,
  Trash2,
  FolderOpen,
  Settings,
} from 'lucide-react'
import { hubAppsByCategory, type HubAppDefinition, hubAppUsesFullPageNav } from '../../../hub/appsCatalog'

/** Icônes par id — purement présentation hub (pas de logique métier). */
const APP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  drive: HardDrive,
  office: FileSpreadsheet,
  corbeille: Trash2,
  mail: Mail,
  pass: Lock,
  calendar: Calendar,
  notes: FileText,
  tasks: ListTodo,
  contacts: Users,
  photos: Image,
  settings: Settings,
}

const APP_COLORS: Record<string, string> = {
  drive: 'text-blue-600 dark:text-blue-400',
  office: 'text-orange-600 dark:text-orange-400',
  corbeille: 'text-slate-600 dark:text-slate-400',
  mail: 'text-violet-600 dark:text-violet-400',
  pass: 'text-emerald-600 dark:text-emerald-400',
  calendar: 'text-amber-600 dark:text-amber-400',
  notes: 'text-slate-700 dark:text-slate-300',
  tasks: 'text-teal-600 dark:text-teal-400',
  contacts: 'text-indigo-600 dark:text-indigo-400',
  photos: 'text-pink-600 dark:text-pink-400',
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Fichiers: FolderOpen,
  Communication: Mail,
  Sécurité: Lock,
  Productivité: Calendar,
  Personnes: Users,
  Médias: Image,
}

function AppLaunchLink({ app }: { app: HubAppDefinition }) {
  const Icon = APP_ICONS[app.id] ?? FileText
  const color = APP_COLORS[app.id] ?? 'text-slate-600'
  const className =
    'flex flex-col gap-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 ' +
    'shadow-sm transition hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-md ' +
    'min-w-[160px] max-w-xs flex-1 p-4 text-left'

  const body = (
    <>
      <span className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
        <Icon className={`h-5 w-5 shrink-0 ${color}`} aria-hidden />
        {app.name}
      </span>
      {app.description ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">{app.description}</span>
      ) : null}
      {app.hosting === 'embedded' && app.workspaceApp ? (
        <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mt-1">
          → {app.workspaceApp.replace('@cloudity/', '')}
        </span>
      ) : null}
    </>
  )

  if (hubAppUsesFullPageNav(app)) {
    return (
      <a href={app.href} aria-label={`Ouvrir ${app.name}`} className={className}>
        {body}
      </a>
    )
  }

  return (
    <Link to={app.href} aria-label={`Ouvrir ${app.name}`} className={className}>
      {body}
    </Link>
  )
}

/**
 * Hub `/app` — launcher uniquement (FE-HUB-01).
 * Pas d’aperçus Mail/Drive/Calendar : zéro fetch métier ici.
 */
export default function AppHub() {
  const sections = hubAppsByCategory()

  return (
    <div className="flex flex-col gap-8 min-h-0">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cloudity — ouvrir une app. Le shell ne contient plus d’aperçus métier.
        </p>
      </div>
      <div className="flex flex-col gap-6 min-h-0">
        {sections.map(({ category, apps }) => {
          const CatIcon = CATEGORY_ICONS[category] ?? FolderOpen
          return (
            <section key={category}>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                <CatIcon className="h-4 w-4" aria-hidden />
                {category}
              </h2>
              <div className="flex flex-wrap gap-3">
                {apps.map((app) => (
                  <AppLaunchLink key={app.id} app={app} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
