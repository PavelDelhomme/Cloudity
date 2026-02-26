import React from 'react'
import { Link } from 'react-router-dom'
import { Mail, Inbox, Send, FileText, ChevronRight } from 'lucide-react'

export default function MailPage() {
  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/app" className="hover:text-slate-700">Tableau de bord</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 font-medium">Mail</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Mail</h1>
        <p className="mt-1 text-sm text-slate-500">Boîte de réception et envoi (interface en construction).</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col min-h-[400px]">
        <div className="grid grid-cols-1 md:grid-cols-3 flex-1">
          <aside className="border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 w-48 p-3 space-y-1">
            <button type="button" className="flex w-full items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
              <Inbox className="h-4 w-4" />
              Boîte de réception
            </button>
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <Send className="h-4 w-4" />
              Envoyés
            </button>
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <FileText className="h-4 w-4" />
              Brouillons
            </button>
          </aside>
          <div className="flex-1 flex flex-col">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Messages</span>
              <button
                type="button"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Nouveau message
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Mail className="h-12 w-12 text-slate-300" />
              <p className="mt-4 text-slate-600">Aucun message</p>
              <p className="mt-1 text-sm text-slate-500">
                Le client mail (IMAP/SMTP) sera connecté dans une prochaine version.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
