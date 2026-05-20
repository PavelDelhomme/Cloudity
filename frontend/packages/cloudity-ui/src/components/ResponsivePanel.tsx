import React from 'react'

type ResponsivePanelProps = {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export function ResponsivePanel({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = 'p-4 sm:p-5',
}: ResponsivePanelProps) {
  return (
    <section
      className={`rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden ${className}`}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-3 border-b border-gray-200 dark:border-slate-600 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
