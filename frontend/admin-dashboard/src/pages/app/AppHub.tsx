import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { HardDrive, Lock, Mail, Calendar, FileText, ListTodo, FileSpreadsheet, Users, Image, Trash2, FolderOpen, ChevronRight } from 'lucide-react'
import { useAuth } from '../../authContext'
import {
  fetchDriveRecentFiles,
  fetchDriveTrash,
  fetchMailAccounts,
  fetchMailMessages,
  fetchCalendarEvents,
  fetchNotes,
  fetchTasks,
  fetchContacts,
  type DriveNode,
  type MailMessageResponse,
  type CalendarEvent,
  type Note,
  type Task,
  type ContactResponse,
} from '../../api'
import { getContactVisitScores } from '../../lib/hubVisits'

type AppItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; color: string }

const OFFICE_LIKE_EXT = new Set([
  '.doc',
  '.docx',
  '.xlsx',
  '.xls',
  '.ppt',
  '.pptx',
  '.csv',
  '.md',
  '.txt',
  '.html',
  '.odt',
  '.ods',
])

function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

/** L'API peut renvoyer `null` ; le défaut `= []` de useQuery ne s'applique qu'à `undefined`. */
function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function isImageNode(n: DriveNode): boolean {
  if (n.is_folder) return false
  const m = (n.mime_type || '').toLowerCase()
  if (m.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(n.name)
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Date / heure courte pour l’aperçu mail du hub (aujourd’hui → heure seule). */
function formatHubMailDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (startMsg === startToday) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatEventWhen(ev: CalendarEvent): string {
  const d = new Date(ev.start_at)
  if (Number.isNaN(d.getTime())) return ''
  if (ev.all_day) return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  return d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function orderContactsForHub(contacts: ContactResponse[], limit: number): ContactResponse[] {
  const scores = getContactVisitScores()
  return [...contacts]
    .sort((a, b) => {
      const vb = scores[b.id] ?? 0
      const va = scores[a.id] ?? 0
      if (vb !== va) return vb - va
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    .slice(0, limit)
}

const categories: { label: string; icon: React.ComponentType<{ className?: string }>; apps: AppItem[] }[] = [
  {
    label: 'Fichiers',
    icon: FolderOpen,
    apps: [
      { name: 'Drive', href: '/app/drive', icon: HardDrive, color: 'text-blue-600 dark:text-blue-400' },
      { name: 'Office', href: '/app/office', icon: FileSpreadsheet, color: 'text-orange-600 dark:text-orange-400' },
      { name: 'Corbeille', href: '/app/corbeille', icon: Trash2, color: 'text-slate-600 dark:text-slate-400' },
    ],
  },
  {
    label: 'Communication',
    icon: Mail,
    apps: [{ name: 'Mail', href: '/app/mail', icon: Mail, color: 'text-violet-600 dark:text-violet-400' }],
  },
  {
    label: 'Sécurité',
    icon: Lock,
    apps: [{ name: 'Pass', href: '/app/pass', icon: Lock, color: 'text-emerald-600 dark:text-emerald-400' }],
  },
  {
    label: 'Productivité',
    icon: Calendar,
    apps: [
      { name: 'Calendar', href: '/app/calendar', icon: Calendar, color: 'text-amber-600 dark:text-amber-400' },
      { name: 'Notes', href: '/app/notes', icon: FileText, color: 'text-slate-700 dark:text-slate-300' },
      { name: 'Tasks', href: '/app/tasks', icon: ListTodo, color: 'text-teal-600 dark:text-teal-400' },
    ],
  },
  {
    label: 'Personnes',
    icon: Users,
    apps: [{ name: 'Contacts', href: '/app/contacts', icon: Users, color: 'text-indigo-600 dark:text-indigo-400' }],
  },
  {
    label: 'Médias',
    icon: Image,
    apps: [{ name: 'Photos', href: '/app/photos', icon: Image, color: 'text-pink-600 dark:text-pink-400' }],
  },
]

function HubPreviewLine({ children, to, state }: { children: React.ReactNode; to: string; state?: object }) {
  return (
    <Link
      to={to}
      state={state}
      className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 truncate py-0.5 group/line"
    >
      <ChevronRight className="h-3 w-3 shrink-0 opacity-0 group-hover/line:opacity-100 transition-opacity" />
      <span className="truncate min-w-0 flex-1">{children}</span>
    </Link>
  )
}

export default function AppHub() {
  const { accessToken } = useAuth()

  const { data: driveRecentRaw, isLoading: driveLoading } = useQuery({
    queryKey: ['hub', 'drive-recent'],
    queryFn: () => fetchDriveRecentFiles(accessToken!, 24),
    enabled: !!accessToken,
    staleTime: 45_000,
    retry: 1,
  })
  const driveRecent = ensureArray(driveRecentRaw)

  const { data: trashNodesRaw } = useQuery({
    queryKey: ['hub', 'trash'],
    queryFn: () => fetchDriveTrash(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
    retry: 1,
  })
  const trashNodes = ensureArray(trashNodesRaw)

  const { data: mailAccountsRaw } = useQuery({
    queryKey: ['hub', 'mail-accounts'],
    queryFn: () => fetchMailAccounts(accessToken!),
    enabled: !!accessToken,
    staleTime: 120_000,
    retry: 1,
  })
  const mailAccounts = ensureArray(mailAccountsRaw)
  type HubUnreadRow = { m: MailMessageResponse; accountId: number; accountEmail: string }

  const mailUnreadByAccount = useQueries({
    queries: mailAccounts.map((acc) => ({
      queryKey: ['hub', 'mail-unread', acc.id] as const,
      queryFn: async (): Promise<{ accountId: number; accountEmail: string; unread: MailMessageResponse[] }> => {
        const page = await fetchMailMessages(accessToken!, acc.id, 'inbox', { limit: 64, offset: 0 })
        return {
          accountId: acc.id,
          accountEmail: acc.email,
          unread: page.messages.filter((m) => !m.is_read),
        }
      },
      enabled: !!accessToken && mailAccounts.length > 0,
      staleTime: 30_000,
      retry: 1,
    })),
  })

  const hubUnreadMailRows: HubUnreadRow[] = mailUnreadByAccount
    .flatMap((q) => {
      if (!q.data) return []
      const { accountId, accountEmail, unread } = q.data
      return unread.map((m) => ({ m, accountId, accountEmail }))
    })
    .sort((a, b) => {
      const ta = new Date(a.m.date_at || 0).getTime()
      const tb = new Date(b.m.date_at || 0).getTime()
      return tb - ta
    })
    .slice(0, 8)

  const { data: calendarEventsRaw } = useQuery({
    queryKey: ['hub', 'calendar'],
    queryFn: () => fetchCalendarEvents(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
    retry: 1,
  })

  const { data: notesRaw } = useQuery({
    queryKey: ['hub', 'notes'],
    queryFn: () => fetchNotes(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
    retry: 1,
  })
  const notes = ensureArray(notesRaw)

  const { data: tasksRaw } = useQuery({
    queryKey: ['hub', 'tasks'],
    queryFn: () => fetchTasks(accessToken!),
    enabled: !!accessToken,
    staleTime: 45_000,
    retry: 1,
  })
  const tasks = ensureArray(tasksRaw)

  const { data: contactsRaw } = useQuery({
    queryKey: ['hub', 'contacts'],
    queryFn: () => fetchContacts(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
    retry: 1,
  })
  const contacts = ensureArray(contactsRaw)

  const driveFilesRecent = useMemo(
    () =>
      [...driveRecent]
        .filter((n) => !n.is_folder)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [driveRecent]
  )

  const officeRecent = useMemo(
    () =>
      driveFilesRecent.filter((n) => OFFICE_LIKE_EXT.has(fileExt(n.name))).slice(0, 4),
    [driveFilesRecent]
  )

  const photoRecent = useMemo(
    () =>
      [...driveRecent]
        .filter(isImageNode)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [driveRecent]
  )

  const upcomingEvents = useMemo(() => {
    const list = ensureArray(calendarEventsRaw)
    const now = Date.now()
    return list
      .filter((e) => new Date(e.end_at).getTime() >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 5)
  }, [calendarEventsRaw])

  const recentNotes = useMemo(
    () =>
      [...notes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 4),
    [notes]
  )

  const openTasks = useMemo(() => {
    const open = tasks.filter((t) => !t.completed)
    return [...open].sort((a, b) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY
      const db = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    }).slice(0, 5)
  }, [tasks])

  const topContacts = useMemo(() => orderContactsForHub(contacts, 5), [contacts])

  const trashPreview = useMemo(() => [...trashNodes].slice(0, 4), [trashNodes])

  function previewForApp(app: AppItem): React.ReactNode {
    if (!accessToken) {
      return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Connectez-vous pour voir les aperçus.</p>
    }
    if (app.href === '/app/drive') {
      if (driveLoading) return <p className="text-xs text-slate-400 mt-2">Chargement…</p>
      if (driveFilesRecent.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Aucun fichier récent — uploadez dans le Drive.</p>
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          {driveFilesRecent.map((n) => (
            <HubPreviewLine key={n.id} to="/app/drive">
              {n.name} <span className="text-slate-400 shrink-0">· {formatShortDate(n.created_at)}</span>
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/office') {
      if (driveLoading) return <p className="text-xs text-slate-400 mt-2">Chargement…</p>
      if (officeRecent.length === 0) {
        return (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Pas de document récent détecté — les fichiers Office viennent du Drive.
          </p>
        )
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          {officeRecent.map((n) => (
            <HubPreviewLine key={n.id} to={`/app/office/editor/${n.id}`} state={{ from: 'office' as const }}>
              {n.name} <span className="text-slate-400 shrink-0">· {formatShortDate(n.created_at)}</span>
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/corbeille') {
      if (trashPreview.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Corbeille vide.</p>
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          <p className="text-[11px] text-slate-500 mb-1">{trashNodes.length} élément(s)</p>
          {trashPreview.map((n) => (
            <HubPreviewLine key={n.id} to="/app/corbeille">
              {n.is_folder ? `📁 ${n.name}` : n.name}
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/mail') {
      if (mailAccounts.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Reliez une boîte mail pour voir les non lus.</p>
      }
      const mailStillLoading = mailUnreadByAccount.some((q) => q.isLoading)
      if (mailStillLoading && hubUnreadMailRows.length === 0) {
        return <p className="text-xs text-slate-400 mt-2">Chargement des non lus…</p>
      }
      if (hubUnreadMailRows.length === 0) {
        return (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Aucun message non lu dans vos boîtes (aperçu toutes les boîtes reliées).
          </p>
        )
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Derniers messages non lus · toutes boîtes</p>
          {hubUnreadMailRows.map(({ m, accountId, accountEmail }) => (
            <HubPreviewLine key={`${accountId}-${m.id}`} to="/app/mail">
              <span className="font-medium text-slate-700 dark:text-slate-300">{m.subject || '(Sans objet)'}</span>
              <span className="text-slate-400"> — {m.from || '?'}</span>
              {m.date_at ? <span className="text-slate-400 shrink-0"> · {formatHubMailDate(m.date_at)}</span> : null}
              {mailAccounts.length > 1 ? (
                <span className="text-slate-400 shrink-0"> · {accountEmail}</span>
              ) : null}
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/pass') {
      return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Aperçu mots de passe — à venir (chiffrement local).</p>
    }
    if (app.href === '/app/calendar') {
      if (upcomingEvents.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Pas d’événement à venir.</p>
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          {upcomingEvents.map((ev) => (
            <HubPreviewLine key={ev.id} to="/app/calendar">
              {formatEventWhen(ev)} — {ev.title}
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/notes') {
      if (recentNotes.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Aucune note — créez-en une.</p>
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          {recentNotes.map((n: Note) => (
            <HubPreviewLine key={n.id} to="/app/notes">
              {n.title || 'Sans titre'} <span className="text-slate-400">· {formatShortDate(n.updated_at)}</span>
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/tasks') {
      if (openTasks.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Toutes les tâches sont cochées — ou liste vide.</p>
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          {openTasks.map((t: Task) => (
            <HubPreviewLine key={t.id} to="/app/tasks">
              {t.title}
              {t.due_at ? <span className="text-slate-400"> · {formatShortDate(t.due_at)}</span> : null}
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/contacts') {
      if (topContacts.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Aucun contact — les plus consultés apparaîtront ici.</p>
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          {topContacts.map((c) => (
            <HubPreviewLine key={c.id} to="/app/contacts">
              {c.name} <span className="text-slate-400">· {c.email}</span>
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    if (app.href === '/app/photos') {
      if (driveLoading) return <p className="text-xs text-slate-400 mt-2">Chargement…</p>
      if (photoRecent.length === 0) {
        return (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Galerie « Photos » à venir — voici les dernières images du Drive.
          </p>
        )
      }
      return (
        <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-600/80 pt-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Dernières images · Drive (app Photos à venir)</p>
          <HubPreviewLine to="/app/photos">Ouvrir l’app Photos</HubPreviewLine>
          {photoRecent.map((n) => (
            <HubPreviewLine key={n.id} to="/app/drive">
              {n.name} <span className="text-slate-400">· {formatShortDate(n.created_at)}</span>
            </HubPreviewLine>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Choisissez une application par catégorie — aperçus des derniers contenus lorsque c’est possible.
        </p>
      </div>
      <div className="space-y-6">
        {categories.map((cat) => (
          <section key={cat.label}>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              <cat.icon className="h-4 w-4" />
              {cat.label}
            </h2>
            <div className="flex flex-wrap gap-3">
              {cat.apps.map((app) => (
                <div
                  key={app.name}
                  className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-md min-w-[240px] max-w-sm flex-1 flex flex-col p-4"
                >
                  <Link
                    to={app.href}
                    aria-label={`Ouvrir ${app.name}`}
                    className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    <app.icon className={`h-5 w-5 shrink-0 ${app.color}`} />
                    {app.name}
                  </Link>
                  {previewForApp(app)}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
