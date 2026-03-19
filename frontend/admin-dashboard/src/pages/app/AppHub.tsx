import React from 'react'
import { Link } from 'react-router-dom'
import { HardDrive, Lock, Mail, Calendar, FileText, ListTodo, FileSpreadsheet, Users, Image, Trash2, FolderOpen } from 'lucide-react'

type AppItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; color: string }

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
    apps: [
      { name: 'Mail', href: '/app/mail', icon: Mail, color: 'text-violet-600 dark:text-violet-400' },
    ],
  },
  {
    label: 'Sécurité',
    icon: Lock,
    apps: [
      { name: 'Pass', href: '/app/pass', icon: Lock, color: 'text-emerald-600 dark:text-emerald-400' },
    ],
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
    apps: [
      { name: 'Contacts', href: '/app/contacts', icon: Users, color: 'text-indigo-600 dark:text-indigo-400' },
    ],
  },
  {
    label: 'Médias',
    icon: Image,
    apps: [
      { name: 'Photos', href: '/app/photos', icon: Image, color: 'text-pink-600 dark:text-pink-400' },
    ],
  },
]

export default function AppHub() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">Choisissez une application par catégorie.</p>
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
                <Link
                  key={app.name}
                  to={app.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <app.icon className={`h-5 w-5 shrink-0 ${app.color}`} />
                  <span className="font-medium text-slate-800 dark:text-slate-200">{app.name}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
