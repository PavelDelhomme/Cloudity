import React from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight } from 'lucide-react'

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/app" className="hover:text-slate-700">Tableau de bord</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 font-medium">Calendar</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">Agenda et événements (interface à venir).</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Calendar className="h-12 w-12 text-slate-300" />
          <p className="mt-4 text-slate-600">Agenda à venir</p>
          <p className="mt-1 text-sm text-slate-500">
            Le service Calendar sera intégré dans une prochaine version.
          </p>
        </div>
      </div>
    </div>
  )
}
