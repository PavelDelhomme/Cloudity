import React, { useCallback, useEffect, useState } from 'react'
import { ServiceStatusPage } from './ServiceStatusPage'

const POLL_MS = 3000
const MAX_WAIT_MS = 180_000

type Phase = 'checking' | 'ready' | 'timeout'

type Props = {
  children: React.ReactNode
}

/** Attend que l’api-gateway réponde sur `/health` avant d’afficher l’app (make up en cours). */
export function StackHealthGate({ children }: Props) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [detail, setDetail] = useState<string | undefined>()
  const [attempt, setAttempt] = useState(0)

  const probe = useCallback(async () => {
    try {
      const res = await fetch('/health', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        setDetail(
          'Réponse HTML au lieu de JSON — proxy Vite cassé ? `docker compose restart cloudity-web`',
        )
        return false
      }
      let body: { status?: string }
      try {
        body = (await res.json()) as { status?: string }
      } catch {
        setDetail('Réponse /health illisible (JSON attendu)')
        return false
      }
      if (res.ok && body.status === 'healthy') {
        setPhase('ready')
        setDetail(undefined)
        return true
      }
      setDetail(`HTTP ${res.status}${body.status ? ` (${body.status})` : ''}`)
    } catch (e) {
      setDetail(e instanceof Error ? e.message : String(e))
    }
    return false
  }, [])

  useEffect(() => {
    let cancelled = false
    const started = Date.now()

    const tick = async () => {
      if (cancelled) return
      const ok = await probe()
      if (ok || cancelled) return
      if (Date.now() - started >= MAX_WAIT_MS) {
        setPhase('timeout')
        return
      }
      window.setTimeout(tick, POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
    }
  }, [probe, attempt])

  if (phase === 'ready') return <>{children}</>

  if (phase === 'timeout') {
    return (
      <ServiceStatusPage
        title="Cloudity ne répond pas"
        message="La stack met trop de temps à démarrer ou un service est en échec."
        detail={detail ?? 'Vérifiez make logs (auth-service, photos-service, passwords-service).'}
        onRetry={() => {
          setPhase('checking')
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <ServiceStatusPage
      title="Démarrage de Cloudity…"
      message="Connexion à l'API en cours. Normal pendant make up ou un redémarrage."
      detail={
        detail ??
        (typeof window !== 'undefined' && window.location.hostname.endsWith('.localhost')
          ? 'Host cloudity.localhost:6001 — vérifiez make up et http://localhost:6002/health'
          : undefined)
      }
    />
  )
}
