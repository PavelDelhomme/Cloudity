import React from 'react'

export function IconButton({
  children,
  variant = 'ghost',
  className = '',
  'aria-label': ariaLabel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  'aria-label': string
}) {
  const base =
    'inline-flex items-center justify-center p-2 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:focus-visible:outline-brand-500'
  const variants = {
    primary: 'bg-blue-600 dark:bg-brand-500 text-white hover:bg-blue-700 dark:hover:bg-brand-600',
    secondary: 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600',
    ghost: 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button type="button" aria-label={ariaLabel} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
