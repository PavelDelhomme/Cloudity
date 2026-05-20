import React from 'react'

type ResponsiveGridProps = {
  children: React.ReactNode
  className?: string
  columnsClassName?: string
}

export function ResponsiveGrid({
  children,
  className = '',
  columnsClassName = 'grid-cols-1 lg:grid-cols-2',
}: ResponsiveGridProps) {
  return <div className={`grid gap-4 sm:gap-6 ${columnsClassName} ${className}`}>{children}</div>
}
