const STORAGE_CONTACT_VISITS = 'cloudity_hub_contact_visits'

/** Incrémente le compteur de « visites » pour un contact (édition / fiche ouverte). */
export function recordContactVisit(contactId: number): void {
  try {
    const raw = localStorage.getItem(STORAGE_CONTACT_VISITS)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const k = String(contactId)
    map[k] = (map[k] ?? 0) + 1
    localStorage.setItem(STORAGE_CONTACT_VISITS, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/** Scores de fréquentation par id de contact (pour le hub). */
export function getContactVisitScores(): Record<number, number> {
  try {
    const raw = localStorage.getItem(STORAGE_CONTACT_VISITS)
    if (!raw) return {}
    const map = JSON.parse(raw) as Record<string, number>
    const out: Record<number, number> = {}
    for (const [k, v] of Object.entries(map)) {
      const id = parseInt(k, 10)
      if (Number.isFinite(id) && typeof v === 'number') out[id] = v
    }
    return out
  } catch {
    return {}
  }
}
