import React from 'react'
import {
  ADDRESS_LABELS,
  EMAIL_LABELS,
  PHONE_COUNTRY_PREFIXES,
  PHONE_LABELS,
  type ContactAddress,
  type ContactLabeledValue,
  type ContactPhone,
  type ContactProfile,
} from '../../../lib/contactProfile'

type Props = {
  profile: ContactProfile
  onChange: (next: ContactProfile) => void
}

function Field({
  id,
  label,
  children,
}: {
  id?: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100'

export function ContactRichForm({ profile, onChange }: Props) {
  const set = <K extends keyof ContactProfile>(key: K, value: ContactProfile[K]) => {
    onChange({ ...profile, [key]: value })
  }

  const phones = profile.phones?.length ? profile.phones : [{ label: 'mobile', value: '', country: 'FR' }]
  const emails = profile.emails?.length ? profile.emails : [{ label: 'personal', value: '' }]
  const addresses = profile.addresses || []
  const websites = profile.websites || []
  const relations = profile.relations || []

  const patchPhone = (i: number, patch: Partial<ContactPhone>) => {
    const next = phones.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    set('phones', next)
  }
  const patchEmail = (i: number, patch: Partial<ContactLabeledValue>) => {
    const next = emails.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    set('emails', next)
  }
  const patchAddress = (i: number, patch: Partial<ContactAddress>) => {
    const next = addresses.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    set('addresses', next)
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Identité</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="c-prefix" label="Préfixe">
            <input id="c-prefix" className={inputClass} value={profile.prefix || ''} onChange={(e) => set('prefix', e.target.value)} placeholder="M., Mme…" />
          </Field>
          <Field id="c-given" label="Prénom">
            <input id="c-given" className={inputClass} value={profile.given_name || ''} onChange={(e) => set('given_name', e.target.value)} />
          </Field>
          <Field id="c-middle" label="Deuxième prénom">
            <input id="c-middle" className={inputClass} value={profile.middle_name || ''} onChange={(e) => set('middle_name', e.target.value)} />
          </Field>
          <Field id="c-family" label="Nom">
            <input id="c-family" className={inputClass} value={profile.family_name || ''} onChange={(e) => set('family_name', e.target.value)} />
          </Field>
          <Field id="c-suffix" label="Suffixe">
            <input id="c-suffix" className={inputClass} value={profile.suffix || ''} onChange={(e) => set('suffix', e.target.value)} placeholder="Jr, PhD…" />
          </Field>
          <Field id="c-nick" label="Pseudo">
            <input id="c-nick" className={inputClass} value={profile.nickname || ''} onChange={(e) => set('nickname', e.target.value)} />
          </Field>
          <Field id="c-fileas" label="Classer en tant que">
            <input id="c-fileas" className={inputClass} value={profile.file_as || ''} onChange={(e) => set('file_as', e.target.value)} placeholder="Nom d’affichage" />
          </Field>
          <Field id="c-phonetic" label="Phonétique">
            <input id="c-phonetic" className={inputClass} value={profile.phonetic || ''} onChange={(e) => set('phonetic', e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Organisation</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="c-org" label="Entreprise">
            <input id="c-org" className={inputClass} value={profile.organization || ''} onChange={(e) => set('organization', e.target.value)} />
          </Field>
          <Field id="c-job" label="Intitulé de poste">
            <input id="c-job" className={inputClass} value={profile.job_title || ''} onChange={(e) => set('job_title', e.target.value)} />
          </Field>
          <Field id="c-dept" label="Service">
            <input id="c-dept" className={inputClass} value={profile.department || ''} onChange={(e) => set('department', e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Téléphones</h3>
          <button
            type="button"
            className="text-xs font-medium text-brand-600 dark:text-brand-400"
            onClick={() => set('phones', [...phones, { label: 'work', value: '', country: 'FR' }])}
          >
            + Ajouter un numéro
          </button>
        </div>
        <div className="space-y-2">
          {phones.map((ph, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12">
              <select
                className={`${inputClass} sm:col-span-3`}
                value={ph.country || 'FR'}
                onChange={(e) => patchPhone(i, { country: e.target.value })}
                aria-label={`Indicatif téléphone ${i + 1}`}
              >
                {PHONE_COUNTRY_PREFIXES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                className={`${inputClass} sm:col-span-4`}
                value={ph.value}
                onChange={(e) => patchPhone(i, { value: e.target.value })}
                placeholder="6 12 34 56 78"
                inputMode="tel"
              />
              <select
                className={`${inputClass} sm:col-span-3`}
                value={ph.label}
                onChange={(e) => patchPhone(i, { label: e.target.value })}
              >
                {PHONE_LABELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="sm:col-span-2 rounded-lg border border-slate-300 px-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
                onClick={() => set('phones', phones.filter((_, j) => j !== i))}
                disabled={phones.length <= 1}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">E-mails</h3>
          <button
            type="button"
            className="text-xs font-medium text-brand-600 dark:text-brand-400"
            onClick={() => set('emails', [...emails, { label: 'work', value: '' }])}
          >
            + Ajouter un e-mail
          </button>
        </div>
        <div className="space-y-2">
          {emails.map((em, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12">
              <input
                className={`${inputClass} sm:col-span-7`}
                type="email"
                value={em.value}
                onChange={(e) => patchEmail(i, { value: e.target.value })}
                placeholder="prenom@exemple.fr"
              />
              <select
                className={`${inputClass} sm:col-span-3`}
                value={em.label}
                onChange={(e) => patchEmail(i, { label: e.target.value })}
              >
                {EMAIL_LABELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="sm:col-span-2 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600"
                onClick={() => set('emails', emails.filter((_, j) => j !== i))}
                disabled={emails.length <= 1}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Adresses</h3>
          <button
            type="button"
            className="text-xs font-medium text-brand-600 dark:text-brand-400"
            onClick={() =>
              set('addresses', [...addresses, { label: 'home', street: '', city: '', postal_code: '', country: '' }])
            }
          >
            + Ajouter une adresse
          </button>
        </div>
        {addresses.map((ad, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2 dark:border-slate-600">
            <div className="flex gap-2">
              <select
                className={inputClass}
                value={ad.label}
                onChange={(e) => patchAddress(i, { label: e.target.value })}
              >
                {ADDRESS_LABELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button type="button" className="text-sm text-red-600" onClick={() => set('addresses', addresses.filter((_, j) => j !== i))}>
                Retirer
              </button>
            </div>
            <input className={inputClass} placeholder="Rue" value={ad.street || ''} onChange={(e) => patchAddress(i, { street: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-3">
              <input className={inputClass} placeholder="Code postal" value={ad.postal_code || ''} onChange={(e) => patchAddress(i, { postal_code: e.target.value })} />
              <input className={inputClass} placeholder="Ville" value={ad.city || ''} onChange={(e) => patchAddress(i, { city: e.target.value })} />
              <input className={inputClass} placeholder="Pays" value={ad.country || ''} onChange={(e) => patchAddress(i, { country: e.target.value })} />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field id="c-bday" label="Anniversaire">
          <input id="c-bday" type="date" className={inputClass} value={profile.birthday || ''} onChange={(e) => set('birthday', e.target.value)} />
        </Field>
        <Field id="c-labels" label="Libellés (séparés par des virgules)">
          <input
            id="c-labels"
            className={inputClass}
            value={(profile.labels || []).join(', ')}
            onChange={(e) =>
              set(
                'labels',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder="famille, travail…"
          />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sites web</h3>
          <button type="button" className="text-xs font-medium text-brand-600" onClick={() => set('websites', [...websites, { label: 'work', value: '' }])}>
            + Site
          </button>
        </div>
        {websites.map((w, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputClass} value={w.value} placeholder="https://" onChange={(e) => {
              const next = websites.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
              set('websites', next)
            }} />
            <button type="button" className="text-sm text-red-600" onClick={() => set('websites', websites.filter((_, j) => j !== i))}>Retirer</button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Relations</h3>
          <button type="button" className="text-xs font-medium text-brand-600" onClick={() => set('relations', [...relations, { label: 'other', value: '' }])}>
            + Relation
          </button>
        </div>
        {relations.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-2">
            <input className={inputClass} placeholder="Libellé (conjoint, assistant…)" value={r.label} onChange={(e) => {
              const next = relations.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
              set('relations', next)
            }} />
            <div className="flex gap-2">
              <input className={inputClass} placeholder="Nom" value={r.value} onChange={(e) => {
                const next = relations.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                set('relations', next)
              }} />
              <button type="button" className="text-sm text-red-600" onClick={() => set('relations', relations.filter((_, j) => j !== i))}>Retirer</button>
            </div>
          </div>
        ))}
      </section>

      <Field id="c-notes" label="Notes">
        <textarea
          id="c-notes"
          rows={3}
          className={inputClass}
          value={profile.notes || ''}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Notes libres sur ce contact…"
        />
      </Field>
    </div>
  )
}
