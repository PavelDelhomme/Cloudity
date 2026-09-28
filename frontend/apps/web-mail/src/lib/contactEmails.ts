/** Adresses e-mail utiles d’une fiche Contacts (primaire + profil). */
export type ContactEmailSource = {
  email?: string | null
  profile?: {
    emails?: Array<{ value?: string | null } | string> | null
  } | null
}

export function normalizeContactEmail(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
}

export function allContactEmails(c: ContactEmailSource): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (raw?: string | null) => {
    const v = normalizeContactEmail(raw)
    if (!v || !v.includes('@') || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }
  add(c.email)
  for (const e of c.profile?.emails ?? []) {
    if (typeof e === 'string') add(e)
    else add(e?.value)
  }
  return out
}
