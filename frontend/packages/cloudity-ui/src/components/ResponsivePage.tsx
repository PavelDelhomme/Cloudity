import React from 'react'
import { PageLayout } from './PageLayout'

type ResponsivePageProps = {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function ResponsivePage({ title, description, action, children, className = '' }: ResponsivePageProps) {
  return (
    <PageLayout title={title} description={description} action={action}>
      <div className={`space-y-4 sm:space-y-6 ${className}`}>{children}</div>
    </PageLayout>
  )
}
