import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileSpreadsheet, FileText, Table, Presentation, FolderPlus, FilePlus } from 'lucide-react'
import toast from 'react-hot-toast'

export default function OfficePage() {
  const [showNewFile, setShowNewFile] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Link to="/app" className="hover:text-slate-700 dark:hover:text-slate-300">Tableau de bord</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 dark:text-slate-100 font-medium">Office</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Suite Office</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Documents, tableurs et présentations (type Nextcloud / OnlyOffice / Office 365). À intégrer au Drive.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/app/drive"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <FolderPlus className="h-4 w-4" />
            Nouveau dossier
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNewFile(!showNewFile)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600"
            >
              <FilePlus className="h-4 w-4" />
              Nouveau fichier
            </button>
            {showNewFile && (
              <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1 z-10">
                <button
                  type="button"
                  onClick={() => { setShowNewFile(false); toast('Création de document à venir'); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <FileText className="h-4 w-4" /> Document
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewFile(false); toast('Création de tableur à venir'); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Table className="h-4 w-4" /> Tableur
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewFile(false); toast('Création de présentation à venir'); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Presentation className="h-4 w-4" /> Présentation
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-8">
        <p className="text-slate-600 dark:text-slate-300 mb-6">Fonctionnalités prévues :</p>
        <ul className="space-y-4">
          <li className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-200"><strong>Documents</strong> — Éditeur type Word (TipTap ou intégration OnlyOffice)</span>
          </li>
          <li className="flex items-center gap-3">
            <Table className="h-5 w-5 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-200"><strong>Tableurs</strong> — Excel-like (Luckysheet ou OnlyOffice)</span>
          </li>
          <li className="flex items-center gap-3">
            <Presentation className="h-5 w-5 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-200"><strong>Présentations</strong> — Slides type PowerPoint</span>
          </li>
        </ul>
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Création et édition depuis le <Link to="/app/drive" className="text-brand-600 dark:text-brand-400 hover:underline">Drive</Link> (à venir).
        </p>
      </div>
    </div>
  )
}
