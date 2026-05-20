import React from 'react'

type ResponsiveSplitViewProps = {
  primary: React.ReactNode
  secondary?: React.ReactNode
  showSecondary?: boolean
  onCloseSecondary?: () => void
  secondaryTitle?: string
  className?: string
  primaryClassName?: string
  secondaryClassName?: string
}

export function ResponsiveSplitView({
  primary,
  secondary,
  showSecondary = false,
  onCloseSecondary,
  secondaryTitle,
  className = '',
  primaryClassName = '',
  secondaryClassName = '',
}: ResponsiveSplitViewProps) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row ${className}`}>
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
          showSecondary ? 'hidden lg:flex lg:min-w-[24rem] lg:max-w-[48rem] lg:flex-none lg:border-l' : 'flex-1'
        } ${primaryClassName}`}
      >
        {primary}
      </div>
      {showSecondary && secondary ? (
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-slate-200 dark:border-slate-600 lg:border-t-0 ${secondaryClassName}`}>
          {secondaryTitle || onCloseSecondary ? (
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-600 px-3 py-2 lg:hidden">
              {secondaryTitle ? <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{secondaryTitle}</p> : <span />}
              {onCloseSecondary ? (
                <button
                  type="button"
                  onClick={onCloseSecondary}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Fermer
                </button>
              ) : null}
            </div>
          ) : null}
          {secondary}
        </div>
      ) : null}
    </div>
  )
}
