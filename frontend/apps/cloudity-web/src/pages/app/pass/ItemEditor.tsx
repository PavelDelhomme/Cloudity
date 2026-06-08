import React, { useEffect, useState } from 'react'
import { Button, Input, Label } from '@cloudity/ui'
import { Eye, EyeOff, Copy, Wand2, Trash2, Save, ArrowLeft, Globe, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { generatePassword, type ItemPlaintextV1 } from '@cloudity/pass-crypto'
import { copyWithAutoClear } from './clipboardAutoClear'
import TotpDisplay from './TotpDisplay'

export interface ItemEditorValue {
  /** Identifiant interne (numérique) si édition d'un item existant. */
  id?: number
  plaintext: ItemPlaintextV1
}

interface Props {
  initial: ItemEditorValue
  saving: boolean
  deleting: boolean
  /** Nom du vault courant — affiché dans le titre uniquement (cosmétique). */
  vaultName: string
  onCancel: () => void
  onSave: (value: ItemEditorValue) => void
  onDelete?: () => void
}

interface LoginFields {
  title: string
  url: string
  username: string
  password: string
  totpUri: string
}

function fieldsFromPlaintext(p: ItemPlaintextV1): LoginFields {
  const f = (p.fields ?? {}) as Record<string, unknown>
  return {
    title: typeof f.title === 'string' ? f.title : '',
    url: typeof f.url === 'string' ? f.url : '',
    username: typeof f.username === 'string' ? f.username : '',
    password: typeof f.password === 'string' ? f.password : '',
    totpUri: typeof f.totpUri === 'string' ? f.totpUri : '',
  }
}

export default function ItemEditor({
  initial,
  saving,
  deleting,
  vaultName,
  onCancel,
  onSave,
  onDelete,
}: Props) {
  const [fields, setFields] = useState<LoginFields>(fieldsFromPlaintext(initial.plaintext))
  const [notes, setNotes] = useState<string>(initial.plaintext.notes ?? '')
  const [showPassword, setShowPassword] = useState(false)

  // Si on change d'item à éditer (sélection autre dans la liste), on reset le form.
  useEffect(() => {
    setFields(fieldsFromPlaintext(initial.plaintext))
    setNotes(initial.plaintext.notes ?? '')
    setShowPassword(false)
  }, [initial])

  const isNew = initial.id == null

  const onGenerate = () => {
    const { password, entropyBits } = generatePassword({
      length: 20,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
      avoidAmbiguous: true,
    })
    setFields((cur) => ({ ...cur, password }))
    setShowPassword(true)
    toast.success(`Mot de passe généré (${Math.round(entropyBits)} bits)`)
  }

  const onCopy = async (label: string, value: string) => {
    if (!value) return
    try {
      await copyWithAutoClear(value, {
        ttlMs: 30_000,
        onCleared: () => toast(`${label} effacé du presse-papiers`),
      })
      toast.success(`${label} copié (auto-effacement 30 s)`)
    } catch (err) {
      toast.error(`Copie : ${err instanceof Error ? err.message : 'erreur'}`)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Ne sérialise totpUri que s'il est non-vide.
    const cleaned: Record<string, unknown> = { ...fields }
    if (!cleaned.totpUri) delete cleaned.totpUri
    const next: ItemPlaintextV1 = {
      schema: 1,
      type: 'login',
      fields: cleaned,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    onSave({ id: initial.id, plaintext: next })
  }

  return (
    <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Retour
          </button>
          <span aria-hidden>·</span>
          <span>{vaultName}</span>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {isNew ? 'Nouvelle entrée' : `Entrée #${initial.id}`}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pass-title">Titre</Label>
        <Input
          id="pass-title"
          type="text"
          placeholder="Ex. Acme Corp — admin"
          value={fields.title}
          onChange={(e) => setFields((cur) => ({ ...cur, title: e.target.value }))}
          autoFocus={isNew}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pass-url">URL</Label>
        <div className="flex gap-2">
          <Input
            id="pass-url"
            type="url"
            placeholder="https://acme.example/login"
            value={fields.url}
            onChange={(e) => setFields((cur) => ({ ...cur, url: e.target.value }))}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            disabled={!fields.url}
            onClick={() => fields.url && window.open(fields.url, '_blank', 'noopener,noreferrer')}
            aria-label="Ouvrir l'URL"
            title="Ouvrir l'URL"
          >
            <Globe className="w-4 h-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pass-username">Utilisateur</Label>
        <div className="flex gap-2">
          <Input
            id="pass-username"
            type="text"
            placeholder="email@example.com"
            value={fields.username}
            onChange={(e) => setFields((cur) => ({ ...cur, username: e.target.value }))}
            autoComplete="off"
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            disabled={!fields.username}
            onClick={() => onCopy('Utilisateur', fields.username)}
            aria-label="Copier l'utilisateur"
            title="Copier l'utilisateur"
          >
            <Copy className="w-4 h-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pass-password">Mot de passe</Label>
        <div className="flex gap-2">
          <Input
            id="pass-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={fields.password}
            onChange={(e) => setFields((cur) => ({ ...cur, password: e.target.value }))}
            autoComplete="new-password"
            className="flex-1 font-mono"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer' : 'Afficher'}
            title={showPassword ? 'Masquer' : 'Afficher'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!fields.password}
            onClick={() => onCopy('Mot de passe', fields.password)}
            aria-label="Copier"
            title="Copier (auto-effacement 30 s)"
          >
            <Copy className="w-4 h-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" onClick={onGenerate} aria-label="Générer" title="Générer un mot de passe fort">
            <Wand2 className="w-4 h-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="pass-totp">Code 2FA (TOTP)</Label>
          {fields.totpUri && (
            <div className="flex items-center text-slate-700 dark:text-slate-200">
              <TotpDisplay otpauthUri={fields.totpUri} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            id="pass-totp"
            type="text"
            placeholder="otpauth://totp/Service:user?secret=BASE32&issuer=Service"
            value={fields.totpUri}
            onChange={(e) => setFields((cur) => ({ ...cur, totpUri: e.target.value }))}
            autoComplete="off"
            className="flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            disabled={!fields.totpUri}
            onClick={() => setFields((cur) => ({ ...cur, totpUri: '' }))}
            aria-label="Effacer la 2FA"
            title="Effacer la 2FA"
          >
            <Clock className="w-4 h-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pass-notes">Notes</Label>
        <textarea
          id="pass-notes"
          rows={3}
          placeholder="Notes libres — chiffrées avec le reste."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
        {!isNew && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            disabled={deleting || saving}
            onClick={onDelete}
            className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="w-4 h-4 mr-1.5" aria-hidden />
            {deleting ? 'Suppression…' : 'Supprimer'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || !fields.title}>
            <Save className="w-4 h-4 mr-1.5" aria-hidden />
            {saving ? 'Chiffrement…' : isNew ? 'Créer' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </form>
  )
}
