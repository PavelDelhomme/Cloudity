import React from 'react'

type ResponsiveStackProps = {
  children: React.ReactNode
  className?: string
  gapClassName?: string
}

export function ResponsiveStack({ children, className = '', gapClassName = 'gap-4' }: ResponsiveStackProps) {
  return <div className={`flex flex-col ${gapClassName} ${className}`}>{children}</div>
}
