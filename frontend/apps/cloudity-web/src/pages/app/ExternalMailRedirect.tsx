import React, { useEffect } from 'react'
import { ServiceStatusPage } from './components/ServiceStatusPage'

/** Prod : quitte le shell vers la SPA Mail (nginx /app/mail/). */
export default function ExternalMailRedirect() {
  useEffect(() => {
    const q = typeof window !== 'undefined' ? window.location.search + window.location.hash : ''
    window.location.replace(`/app/mail/${q}`)
  }, [])
  return <ServiceStatusPage title="Mail…" message="Ouverture de l’application Mail." />
}
