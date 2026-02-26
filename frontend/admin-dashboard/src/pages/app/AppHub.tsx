import React from 'react'
import { Link } from 'react-router-dom'
import { HardDrive, Lock, Mail, Calendar, FileText, ListTodo, ArrowRight, FileSpreadsheet, Users, Image } from 'lucide-react'

const apps = [
  {
    name: 'Drive',
    description: 'Fichiers et dossiers, synchronisation et partage sécurisé.',
    href: '/app/drive',
    icon: HardDrive,
    color: 'bg-blue-500',
    bgLight: 'bg-blue-50',
    textColor: 'text-blue-700',
  },
  {
    name: 'Office',
    description: 'Documents, tableurs et présentations (type OnlyOffice / Office 365). À venir.',
    href: '/app/office',
    icon: FileSpreadsheet,
    color: 'bg-orange-500',
    bgLight: 'bg-orange-50',
    textColor: 'text-orange-700',
  },
  {
    name: 'Pass',
    description: 'Coffre-fort et gestionnaire de mots de passe.',
    href: '/app/pass',
    icon: Lock,
    color: 'bg-emerald-500',
    bgLight: 'bg-emerald-50',
    textColor: 'text-emerald-700',
  },
  {
    name: 'Mail',
    description: 'Boîte mail, dossiers et envoi de messages.',
    href: '/app/mail',
    icon: Mail,
    color: 'bg-violet-500',
    bgLight: 'bg-violet-50',
    textColor: 'text-violet-700',
  },
  {
    name: 'Calendar',
    description: 'Agenda et événements.',
    href: '/app/calendar',
    icon: Calendar,
    color: 'bg-amber-500',
    bgLight: 'bg-amber-50',
    textColor: 'text-amber-700',
  },
  {
    name: 'Notes',
    description: 'Notes et bloc-notes.',
    href: '/app/notes',
    icon: FileText,
    color: 'bg-slate-600',
    bgLight: 'bg-slate-50',
    textColor: 'text-slate-700',
  },
  {
    name: 'Tasks',
    description: 'Tâches et to-do.',
    href: '/app/tasks',
    icon: ListTodo,
    color: 'bg-teal-500',
    bgLight: 'bg-teal-50',
    textColor: 'text-teal-700',
  },
  {
    name: 'Contacts',
    description: 'Carnet d’adresses (à venir).',
    href: '/app/contacts',
    icon: Users,
    color: 'bg-indigo-500',
    bgLight: 'bg-indigo-50',
    textColor: 'text-indigo-700',
  },
  {
    name: 'Photos',
    description: 'Galerie et stockage photos (à venir).',
    href: '/app/photos',
    icon: Image,
    color: 'bg-pink-500',
    bgLight: 'bg-pink-50',
    textColor: 'text-pink-700',
  },
]

export default function AppHub() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">Choisissez une application pour continuer.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <Link
            key={app.name}
            to={app.href}
            className="group flex flex-col rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-md"
          >
            <div className={`inline-flex rounded-xl p-3 ${app.bgLight} ${app.textColor} dark:bg-slate-700 dark:text-slate-200`}>
              <app.icon className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400">
              {app.name}
            </h2>
            <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-400">{app.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
              Ouvrir
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
