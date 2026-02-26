import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Users } from 'lucide-react'

export default function ContactsPage() {
  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/app" className="hover:text-slate-700 dark:hover:text-slate-300">Tableau de bord</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Contacts</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Contacts</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Carnet d’adresses — à venir. Interconnexion Mail, Calendar et Tasks.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-8 flex flex-col items-center justify-center text-center">
        <Users className="h-12 w-12 text-slate-300 dark:text-slate-500 mb-4" />
        <p className="text-slate-600 dark:text-slate-300">L’application Contacts sera disponible prochainement.</p>
      </div>
    </div>
  )
}
