import React from 'react'

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: 'success' | 'warning' | 'error' | 'default'
}) {
  const styles = {
    success: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
    warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
    error: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
    default: 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  )
}
