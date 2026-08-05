/** Profil contact riche (APP-08) — aligné API `contacts.profile` JSONB. */

export type ContactLabeledValue = {
  label: string
  value: string
}

export type ContactPhone = ContactLabeledValue & {
  /** Code pays UI (ex. FR) — préfixe affiché à part */
  country?: string
}

export type ContactAddress = {
  label: string
  street?: string
  city?: string
  postal_code?: string
  region?: string
  country?: string
}

export type ContactProfile = {
  given_name?: string
  family_name?: string
  middle_name?: string
  prefix?: string
  suffix?: string
  nickname?: string
  phonetic?: string
  organization?: string
  job_title?: string
  department?: string
  file_as?: string
  birthday?: string
  notes?: string
  phones?: ContactPhone[]
  emails?: ContactLabeledValue[]
  addresses?: ContactAddress[]
  websites?: ContactLabeledValue[]
  relations?: ContactLabeledValue[]
  labels?: string[]
}

export const PHONE_LABELS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'home', label: 'Domicile' },
  { value: 'work', label: 'Travail' },
  { value: 'other', label: 'Autre' },
  { value: 'custom', label: 'Personnalisé' },
] as const

export const EMAIL_LABELS = [
  { value: 'personal', label: 'Personnel' },
  { value: 'work', label: 'Travail' },
  { value: 'other', label: 'Autre' },
] as const

export const ADDRESS_LABELS = [
  { value: 'home', label: 'Domicile' },
  { value: 'work', label: 'Travail' },
  { value: 'other', label: 'Autre' },
] as const

/** Préfixes téléphoniques courants (libellé UI). */
export const PHONE_COUNTRY_PREFIXES: { code: string; dial: string; label: string }[] = [
  { code: 'FR', dial: '+33', label: 'France (+33)' },
  { code: 'BE', dial: '+32', label: 'Belgique (+32)' },
  { code: 'CH', dial: '+41', label: 'Suisse (+41)' },
  { code: 'LU', dial: '+352', label: 'Luxembourg (+352)' },
  { code: 'DE', dial: '+49', label: 'Allemagne (+49)' },
  { code: 'GB', dial: '+44', label: 'Royaume-Uni (+44)' },
  { code: 'US', dial: '+1', label: 'USA / Canada (+1)' },
  { code: 'ES', dial: '+34', label: 'Espagne (+34)' },
  { code: 'IT', dial: '+39', label: 'Italie (+39)' },
  { code: 'OTHER', dial: '', label: 'Autre / international' },
]

export function emptyContactProfile(): ContactProfile {
  return {
    given_name: '',
    family_name: '',
    middle_name: '',
    prefix: '',
    suffix: '',
    nickname: '',
    organization: '',
    job_title: '',
    department: '',
    file_as: '',
    birthday: '',
    notes: '',
    phones: [{ label: 'mobile', value: '', country: 'FR' }],
    emails: [{ label: 'personal', value: '' }],
    addresses: [],
    websites: [],
    relations: [],
    labels: [],
  }
}

export function composeDisplayName(profile: ContactProfile, fallbackEmail = ''): string {
  const fileAs = profile.file_as?.trim()
  if (fileAs) return fileAs
  const parts = [
    profile.prefix?.trim(),
    profile.given_name?.trim(),
    profile.middle_name?.trim(),
    profile.family_name?.trim(),
    profile.suffix?.trim(),
  ].filter(Boolean)
  if (parts.length) return parts.join(' ')
  const nick = profile.nickname?.trim()
  if (nick) return nick
  const org = profile.organization?.trim()
  if (org) return org
  return fallbackEmail.trim()
}

/** Premier téléphone utile (dénormalisé colonne `phone`). */
export function primaryPhone(profile: ContactProfile): string {
  for (const p of profile.phones || []) {
    const v = formatPhoneValue(p).trim()
    if (v) return v
  }
  return ''
}

/** Premier email utile (dénormalisé colonne `email`). */
export function primaryEmail(profile: ContactProfile, legacy = ''): string {
  for (const e of profile.emails || []) {
    const v = e.value.trim().toLowerCase()
    if (v.includes('@')) return v
  }
  return legacy.trim().toLowerCase()
}

export function formatPhoneValue(p: ContactPhone): string {
  const raw = (p.value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return raw
  const dial =
    PHONE_COUNTRY_PREFIXES.find((c) => c.code === (p.country || 'FR'))?.dial || ''
  if (!dial) return raw
  // 0XXXXXXXX → +33XXXXXXXX (FR)
  if (dial === '+33' && raw.startsWith('0')) {
    return dial + raw.slice(1).replace(/\s/g, '')
  }
  return `${dial}${raw.replace(/\s/g, '')}`
}

export function profileFromLegacy(name: string, email: string, phone?: string): ContactProfile {
  const p = emptyContactProfile()
  const n = name.trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length === 1) p.given_name = parts[0]
    else {
      p.given_name = parts[0]
      p.family_name = parts.slice(1).join(' ')
    }
  }
  if (email?.trim()) p.emails = [{ label: 'personal', value: email.trim().toLowerCase() }]
  if (phone?.trim()) p.phones = [{ label: 'mobile', value: phone.trim(), country: 'OTHER' }]
  return p
}

export function mergeProfile(base: ContactProfile | null | undefined, legacy: {
  name: string
  email: string
  phone?: string
}): ContactProfile {
  if (base && Object.keys(base).length > 0) {
    const p = { ...emptyContactProfile(), ...base }
    if (!p.emails?.length && legacy.email) {
      p.emails = [{ label: 'personal', value: legacy.email }]
    }
    if (!p.phones?.length && legacy.phone) {
      p.phones = [{ label: 'mobile', value: legacy.phone, country: 'OTHER' }]
    }
    if (!p.given_name && !p.family_name && legacy.name) {
      const fromLegacy = profileFromLegacy(legacy.name, '', '')
      p.given_name = fromLegacy.given_name
      p.family_name = fromLegacy.family_name
    }
    return p
  }
  return profileFromLegacy(legacy.name, legacy.email, legacy.phone)
}
