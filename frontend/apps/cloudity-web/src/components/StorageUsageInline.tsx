import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HardDrive } from 'lucide-react'
import { useAuth } from '../authContext'
import { fetchDriveStorageSummary, type DriveStorageSummary } from '../api'

export function formatStorageBytes(bytes: number): string {
  if (bytes <= 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unit]}`
}

type StorageUsageInlineProps = {
  /** Affiche uniquement la ligne Drive ou Photos. */
  scope?: 'drive' | 'photos' | 'all'
  className?: string
}

export default function StorageUsageInline({ scope = 'all', className = '' }: StorageUsageInlineProps) {
  const { accessToken } = useAuth()
  const [usage, setUsage] = useState<DriveStorageSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      setUsage(await fetchDriveStorageSummary(accessToken))
    } catch {
      setUsage(null)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  if (!accessToken) return null

  const driveLine =
    usage && (scope === 'all' || scope === 'drive')
      ? `${formatStorageBytes(usage.drive.bytes)} Drive`
      : null
  const photosLine =
    usage && (scope === 'all' || scope === 'photos')
      ? `${formatStorageBytes(usage.photos.bytes)} Photos`
      : null

  const label = [photosLine, driveLine].filter(Boolean).join(' · ')

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 ${className}`}
      title="Espace utilisé sur ton compte"
    >
      <HardDrive className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      {loading && !usage ? (
        <span>Quota…</span>
      ) : label ? (
        <span>{label}</span>
      ) : (
        <span>Quota indisponible</span>
      )}
      <Link
        to="/app/settings"
        className="ml-1 text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
      >
        Détails
      </Link>
    </div>
  )
}
