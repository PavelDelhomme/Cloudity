import React from 'react'

type ResponsiveToolbarProps = {
  children: React.ReactNode
  className?: string
}

export function ResponsiveToolbar({ children, className = '' }: ResponsiveToolbarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] ${className}`}
    >
      {children}
    </div>
  )
}
