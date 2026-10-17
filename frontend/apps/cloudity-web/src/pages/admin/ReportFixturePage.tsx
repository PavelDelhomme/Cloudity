import React, { useEffect, useState } from 'react'
import { ReportDocument } from './ReportDocument'
import { companionNoteName } from './reportReading'

const ITEMS = [
  { title: '16 oct 2026 — lot de nuit', filename: 'Hubera-2026-10-16-nuit.pdf' },
  { title: 'Note 16 oct 2026 — nuit', filename: '2026-10-16-nuit.md' },
]

/** Accueil local : même clic que l’admin, sans session. Servi seulement par Vite. */
export default function ReportFixturePage() {
  const [note, setNote] = useState('')
  const [open, setOpen] = useState<(typeof ITEMS)[number] | null>(null)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    void fetch('/fixture-nuit.md')
      .then((r) => r.text())
      .then(setNote)
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Accueil Admin — rapports</h1>
        <button type="button" className="rounded-lg border border-slate-400 px-3 py-1.5 text-sm" onClick={toggleTheme}>
          {dark ? 'Mode sombre' : 'Mode clair'}
        </button>
      </div>
      {open ? (
        <section>
          <button type="button" className="mb-3 text-base font-medium text-blue-800 underline dark:text-blue-300" onClick={() => setOpen(null)}>
            Retour aux rapports
          </button>
          <h2 className="mb-3 text-xl font-semibold">{open.title}</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            {companionNoteName(open.filename, ITEMS.map((i) => i.filename)) || open.filename}
          </p>
          <ReportDocument markdown={note} />
        </section>
      ) : (
        <ul className="space-y-2">
          {ITEMS.map((item) => (
            <li key={item.filename}>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-left dark:border-slate-600 dark:bg-slate-950"
                onClick={() => setOpen(item)}
              >
                <span className="block text-base font-semibold">{item.title}</span>
                <span className="block text-sm text-slate-600 dark:text-slate-300">{item.filename}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
