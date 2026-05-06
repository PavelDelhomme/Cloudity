import React from 'react'
import { Button } from './PageLayout'

type PaginationControlsProps = {
  page: number
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}

export function PaginationControls({ page, canPrev, canNext, onPrev, onNext }: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
      <span className="text-xs text-slate-500 dark:text-slate-400">Page {page + 1}</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onPrev} disabled={!canPrev}>
          Précédent
        </Button>
        <Button variant="ghost" onClick={onNext} disabled={!canNext}>
          Suivant
        </Button>
      </div>
    </div>
  )
}
