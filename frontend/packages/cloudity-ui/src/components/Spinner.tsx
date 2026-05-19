import React from 'react'

export function Spinner({ className = '', label = 'Chargement' }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-slate-600 dark:border-t-brand-500 ${className}`}
    />
  )
}
