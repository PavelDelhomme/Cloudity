import React, { useState } from 'react'
import { mailFaviconUrl, passDomainFromUrl } from '@cloudity/shared'

export type SiteFaviconProps = {
  url?: string
  title?: string
  className?: string
  size?: number
}

/** Favicon site (proxy Mail) — composant transverse réutilisable par Pass, Mail, etc. */
export default function SiteFavicon({ url, title, className = '', size = 20 }: SiteFaviconProps) {
  const domain = passDomainFromUrl(url)
  const [failed, setFailed] = useState(false)
  const letter = (title?.trim()?.[0] ?? domain?.[0] ?? '?').toUpperCase()

  if (!domain || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md bg-slate-200 dark:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-200 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {letter}
      </span>
    )
  }

  const src = mailFaviconUrl(domain)
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`inline-block shrink-0 rounded-md bg-white dark:bg-slate-800 object-contain ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export { passDomainFromUrl }
