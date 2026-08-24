import React, { useEffect } from 'react'
import { ServiceStatusPage } from '../../components/ServiceStatusPage'

/** Prod : quitte le shell vers la SPA Drive (nginx /app/drive/). */
export default function ExternalDriveRedirect() {
  useEffect(() => {
    const q = typeof window !== 'undefined' ? window.location.search + window.location.hash : ''
    window.location.replace(`/app/drive/${q}`)
  }, [])
  return <ServiceStatusPage title="Drive…" message="Ouverture de l’application Drive." />
}
