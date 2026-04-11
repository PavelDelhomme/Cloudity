import React from 'react'
import { Image } from 'lucide-react'

export default function PhotosPage() {
  return (
    <div className="flex flex-col gap-6 min-h-0">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Photos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Galerie et stockage photos — à venir. Sync et partage d’albums.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-8 flex flex-col items-center justify-center text-center">
        <Image className="h-12 w-12 text-slate-300 dark:text-slate-500 mb-4" />
        <p className="text-slate-600 dark:text-slate-300">L’application Photos sera disponible prochainement.</p>
      </div>
    </div>
  )
}
