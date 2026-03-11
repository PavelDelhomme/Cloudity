/**
 * Formatage de dates pour l’affichage (récent, relatif, absolu).
 */

/** Retourne une chaîne du type "Il y a 5 min", "Modifié aujourd’hui", "Modifié le 12 mars 2025". */
export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffH = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffH / 24)

  if (diffMin < 1) return "À l'instant"
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffH < 24) return `Il y a ${diffH} h`
  if (diffDay === 1) return 'Hier'
  if (diffDay < 7) return `Il y a ${diffDay} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

/** Même chose que formatRelativeDate mais avec l'heure si < 24 h : "Aujourd'hui 14h32", "Hier 09h15", sinon date seule. */
export function formatRelativeDateWithTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (dayStart.getTime() === today.getTime()) return `Aujourd'hui ${timeStr}`
  if (dayStart.getTime() === yesterday.getTime()) return `Hier ${timeStr}`
  if (now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000) return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) + ` ${timeStr}`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

/** Date complète pour tooltip ou affichage secondaire. */
export function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Libellé de groupe pour "Récents" : Aujourd'hui, Hier, Cette semaine, ou date courte. */
export function formatRecentGroupLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Autre'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'Autre'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (dayStart.getTime() === today.getTime()) return "Aujourd'hui"
  if (dayStart.getTime() === yesterday.getTime()) return 'Hier'
  if (d.getTime() >= weekAgo.getTime()) return 'Cette semaine'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
