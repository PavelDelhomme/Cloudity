import React from 'react'

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`block w-full rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400 focus:border-blue-500 dark:focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-500 sm:text-sm ${className}`}
      {...props}
    />
  )
}
