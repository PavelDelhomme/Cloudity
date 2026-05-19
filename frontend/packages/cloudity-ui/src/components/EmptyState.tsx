import React from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-500 dark:text-slate-400 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
