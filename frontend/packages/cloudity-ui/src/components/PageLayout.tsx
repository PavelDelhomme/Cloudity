import React from 'react'

type PageLayoutProps = {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}

export function PageLayout({ title, description, action, children }: PageLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}
