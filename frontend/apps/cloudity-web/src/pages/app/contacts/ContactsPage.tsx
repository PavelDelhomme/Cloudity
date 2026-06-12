import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Mail, X, Upload, Loader2, Settings, Lock } from 'lucide-react'
import { AppLockedGate } from '../AppLockedGate'
import {
  APP_LOCKED_SESSION_TTL_MS,
  appLockedVaultScope,
  grantAppLockedVaultSession,
  isAppLockedVaultUnlocked,
  revokeAppLockedVaultSession,
} from '../appLockedVault'
import {
  DEFAULT_CONTACTS_APP_SETTINGS,
  loadContactsAppSettings,
  saveContactsAppSettings,
  type ContactsAppSettings,
  type ContactsImportDuplicateMode,
} from './contactsAppSettings'
import toast from 'react-hot-toast'
import { useAuth } from '../../../authContext'
import {
  fetchContacts,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  type ContactResponse,
} from '../../../api'
import { detectAndParseContacts, type ParsedImportContact } from '../../../lib/contactImport'
import { recordContactVisit } from '../../../lib/hubVisits'

export default function ContactsPage() {
  const { accessToken, tenantId, email } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [importPreview, setImportPreview] = useState<{
    fileName: string
    format: string
    contacts: ParsedImportContact[]
  } | null>(null)
  const [contactsSettings, setContactsSettings] = useState<ContactsAppSettings>(() => loadContactsAppSettings())
  const [showContactsSettings, setShowContactsSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<ContactsAppSettings>(() => loadContactsAppSettings())
  const [importDuplicateMode, setImportDuplicateMode] = useState<ContactsImportDuplicateMode>(
    () => loadContactsAppSettings().defaultImportDuplicateMode
  )
  const [importBusy, setImportBusy] = useState(false)
  const contactsVaultScope = appLockedVaultScope('contacts', tenantId, email)
  const [contactsVaultUnlocked, setContactsVaultUnlocked] = useState(() =>
    isAppLockedVaultUnlocked('contacts', appLockedVaultScope('contacts', tenantId, email))
  )
  const contactsVaultRequired = contactsSettings.lockEnabled
  const contactsVaultReady = !contactsVaultRequired || Boolean(contactsVaultScope && contactsVaultUnlocked)

  useEffect(() => {
    setContactsVaultUnlocked(isAppLockedVaultUnlocked('contacts', contactsVaultScope))
  }, [contactsVaultScope, contactsSettings.lockEnabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showContactsSettings) {
        e.preventDefault()
        setShowContactsSettings(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showContactsSettings])

  const handleContactsVaultUnlocked = () => {
    if (!contactsVaultScope) return
    grantAppLockedVaultSession('contacts', contactsVaultScope, APP_LOCKED_SESSION_TTL_MS)
    setContactsVaultUnlocked(true)
  }

  const lockContactsVault = () => {
    revokeAppLockedVaultSession('contacts', contactsVaultScope)
    setContactsVaultUnlocked(false)
    setSelectedId(null)
    setShowForm(false)
    setImportPreview(null)
    queryClient.removeQueries({ queryKey: ['contacts'] })
  }

  useEffect(() => {
    const q = searchParams.get('q')
    if (q != null && q !== '') setSearch(q)
  }, [searchParams])

  const { data: contacts = [], isLoading, isError, error } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => fetchContacts(accessToken!),
    enabled: !!accessToken && contactsVaultReady,
    staleTime: 20_000,
    /** Liste à jour sans F5 (autre client ou import côté serveur). */
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = !q
      ? contacts
      : contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            (c.phone && c.phone.toLowerCase().includes(q))
        )
    if (!contactsSettings.sortAlphabetically) return list
    return [...list].sort((a, b) => {
      const la = (a.name.trim() || a.email).toLocaleLowerCase('fr')
      const lb = (b.name.trim() || b.email).toLocaleLowerCase('fr')
      return la.localeCompare(lb, 'fr')
    })
  }, [contacts, search, contactsSettings.sortAlphabetically])

  const selected = selectedId != null ? contacts.find((c) => c.id === selectedId) : null

  const initials = (name: string, email: string) => {
    const t = name.trim() || email
    const parts = t.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
    return t.slice(0, 2).toUpperCase()
  }

  const createMutation = useMutation({
    mutationFn: (payload: { name?: string; email: string; phone?: string }) =>
      createContact(accessToken!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setFormName('')
      setFormEmail('')
      setFormPhone('')
      setShowForm(false)
      toast.success('Contact ajouté')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name?: string; email?: string; phone?: string } }) =>
      updateContact(accessToken!, id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setEditingId(null)
      toast.success('Contact mis à jour')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteContact(accessToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact supprimé')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  const requestDelete = (id: number, label: string) => {
    if (contactsSettings.confirmDelete && !window.confirm(`Supprimer le contact « ${label} » ?`)) return
    deleteMutation.mutate(id)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const email = formEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email invalide')
      return
    }
    if (editingId != null) {
      updateMutation.mutate({
        id: editingId,
        payload: { name: formName.trim() || undefined, email, phone: formPhone.trim() || undefined },
      })
    } else {
      createMutation.mutate({
        name: formName.trim() || undefined,
        email,
        phone: formPhone.trim() || undefined,
      })
    }
  }

  const startEdit = (c: ContactResponse) => {
    recordContactVisit(c.id)
    setEditingId(c.id)
    setFormName(c.name)
    setFormEmail(c.email)
    setFormPhone(c.phone || '')
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
  }

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const { format, contacts } = detectAndParseContacts(file.name, text)
      if (contacts.length === 0) {
        toast.error(
          format === 'unknown'
            ? 'Aucun contact valide trouvé. Utilisez un CSV type Google (colonnes E-mail / Email), un JSON [{ "name", "email" }], ou un tableau HTML avec colonne email.'
            : 'Aucun e-mail valide dans ce fichier.'
        )
        setImportPreview(null)
        return
      }
      setImportPreview({ fileName: file.name, format, contacts })
    } catch {
      toast.error('Impossible de lire le fichier')
      setImportPreview(null)
    }
  }

  const runImport = async () => {
    if (!accessToken || !importPreview?.contacts.length) return
    setImportBusy(true)
    try {
      const r = await importContacts(accessToken, importPreview.contacts, importDuplicateMode)
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(
        `Import terminé : ${r.imported} ajouté(s), ${r.updated} mis à jour, ${r.skipped} ignoré(s)${r.invalid ? `, ${r.invalid} ligne(s) invalide(s)` : ''}.`
      )
      setImportPreview(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import impossible')
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Contacts</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Style carnet type Google Contacts : recherche, fiche rapide, envoi depuis Mail.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom, email, téléphone…"
              className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
            <Link
              to="/app/mail"
              className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Ouvrir Mail
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {contactsVaultRequired && contactsVaultUnlocked ? (
            <button
              type="button"
              onClick={lockContactsVault}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/50"
            >
              <Lock className="h-5 w-5" aria-hidden />
              Verrouiller Contacts
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSettingsDraft(contactsSettings)
              setShowContactsSettings(true)
            }}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
            title="Paramètres Contacts"
            aria-label="Paramètres Contacts"
          >
            <Settings className="h-5 w-5" aria-hidden />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.json,.html,.htm,text/csv,application/json,text/html"
            className="hidden"
            onChange={onImportFile}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <Upload className="h-5 w-5" />
            Importer (CSV, JSON, HTML)
          </button>
          <button
            type="button"
            onClick={() => { cancelForm(); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <Plus className="h-5 w-5" />
            Nouveau contact
          </button>
        </div>
      </div>

      {showContactsSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contacts-settings-title"
          onClick={() => setShowContactsSettings(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="contacts-settings-title" className="text-lg font-semibold text-neutral-900 dark:text-slate-100">
                Paramètres Contacts
              </h2>
              <button
                type="button"
                onClick={() => setShowContactsSettings(false)}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-slate-800"
                aria-label="Fermer les paramètres Contacts"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Tri alphabétique</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.sortAlphabetically}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, sortAlphabetically: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Afficher le téléphone dans la liste</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.showPhoneInList}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, showPhoneInList: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Confirmer avant suppression</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.confirmDelete}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, confirmDelete: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Doublons à l’import (par défaut)</span>
                <select
                  value={settingsDraft.defaultImportDuplicateMode}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      defaultImportDuplicateMode: e.target.value as ContactsImportDuplicateMode,
                    }))
                  }
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="skip">Ignorer les e-mails déjà présents</option>
                  <option value="update">Mettre à jour si l’e-mail existe</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-800 dark:text-slate-200">Protéger Contacts par coffre local</span>
                <input
                  type="checkbox"
                  checked={settingsDraft.lockEnabled}
                  onChange={(e) =>
                    setSettingsDraft((prev) => ({ ...prev, lockEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsDraft(DEFAULT_CONTACTS_APP_SETTINGS)}
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm dark:border-slate-600"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={() => {
                  setContactsSettings(settingsDraft)
                  saveContactsAppSettings(settingsDraft)
                  setImportDuplicateMode(settingsDraft.defaultImportDuplicateMode)
                  setShowContactsSettings(false)
                  toast.success('Paramètres Contacts enregistrés')
                }}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {contactsVaultRequired && accessToken && contactsVaultScope && !contactsVaultUnlocked ? (
        <AppLockedGate
          kind="contacts"
          scope={contactsVaultScope}
          appLabel="Contacts"
          description="Saisissez votre code local avant d’afficher, importer ou modifier vos contacts sur cet appareil."
          onUnlocked={handleContactsVaultUnlocked}
        />
      ) : null}

      {contactsVaultRequired && accessToken && !contactsVaultScope ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Session incomplète : reconnectez-vous pour accéder au coffre Contacts.
        </p>
      ) : null}

      {contactsVaultReady ? (
      <>
      {importPreview && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/20 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Importer des contacts</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Fichier : <span className="font-medium">{importPreview.fileName}</span> — format détecté :{' '}
                <span className="font-mono">{importPreview.format}</span> —{' '}
                <span className="font-medium">{importPreview.contacts.length}</span> contact(s) avec e-mail valide.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                Export Google : Contacts → Exporter → « Google CSV » ou JSON (Takeout). Les doublons sont détectés par e-mail.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImportPreview(null)}
              className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="dup"
                checked={importDuplicateMode === 'skip'}
                onChange={() => setImportDuplicateMode('skip')}
              />
              Ignorer les e-mails déjà présents
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="dup"
                checked={importDuplicateMode === 'update'}
                onChange={() => setImportDuplicateMode('update')}
              />
              Mettre à jour nom / téléphone si l’e-mail existe déjà
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={importBusy}
              onClick={() => void runImport()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {importBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Lancer l’import
            </button>
            <button
              type="button"
              disabled={importBusy}
              onClick={() => setImportPreview(null)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-200"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
            {editingId != null ? 'Modifier le contact' : 'Ajouter un contact'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nom</label>
              <input
                id="contact-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email *</label>
              <input
                id="contact-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="jean@exemple.fr"
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Téléphone</label>
              <input
                id="contact-phone"
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={cancelForm} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300">
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending || !formEmail.trim()}
              className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {editingId != null ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden min-h-[280px] max-h-[calc(100dvh-11rem)] lg:max-h-[calc(100dvh-10rem)] lg:min-h-0">
        {isError && (
          <div className="lg:col-span-5 p-4 text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Erreur de chargement'}
          </div>
        )}
        {isLoading && (
          <div className="lg:col-span-5 p-8 text-center text-slate-500 dark:text-slate-400">Chargement…</div>
        )}
        {!isLoading && !isError && contacts.length === 0 && (
          <div className="lg:col-span-5 p-8 flex flex-col items-center justify-center text-center">
            <Users className="h-12 w-12 text-slate-300 dark:text-slate-500 mb-4" />
            <p className="text-slate-600 dark:text-slate-300">Aucun contact. Ajoutez-en un pour les retrouver comme destinataires dans Mail.</p>
          </div>
        )}
        {!isLoading && !isError && contacts.length > 0 && (
          <>
            <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-600 flex flex-col min-h-0 max-h-[50vh] lg:max-h-full">
              <ul className="divide-y divide-slate-200 dark:divide-slate-600 min-h-0 flex-1 overflow-y-auto overscroll-contain lg:max-h-full">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${selectedId === c.id ? 'ring-2 ring-brand-400 ring-offset-2 dark:ring-offset-slate-800' : ''}`}
                        style={{ background: 'linear-gradient(135deg, #1a73e8, #34a853)' }}
                      >
                        {initials(c.name, c.email)}
                      </button>
                      <button type="button" onClick={() => setSelectedId(c.id)} className="min-w-0 flex-1 text-left">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{c.name.trim() || c.email}</p>
                        {c.name.trim() ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.email}</p>
                        ) : null}
                        {contactsSettings.showPhoneInList && c.phone ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{c.phone}</p>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-xs text-brand-600 dark:text-brand-400 px-2 py-1 rounded hover:bg-brand-50 dark:hover:bg-brand-900/20"
                      >
                        Modifier
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {filtered.length === 0 && search.trim() ? (
                <p className="p-4 text-sm text-slate-500">Aucun résultat pour « {search} ».</p>
              ) : null}
            </div>
            <div className="lg:col-span-3 p-5 bg-slate-50/50 dark:bg-slate-900/30 min-h-0 overflow-y-auto overscroll-contain lg:max-h-full">
              {selected ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow"
                      style={{ background: 'linear-gradient(135deg, #1a73e8, #ea4335)' }}
                    >
                      {initials(selected.name, selected.email)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{selected.name}</h2>
                      <p className="text-sm text-slate-600 dark:text-slate-300 break-all">{selected.email}</p>
                      {selected.phone ? <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{selected.phone}</p> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/app/mail?compose=${encodeURIComponent(selected.email)}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700"
                    >
                      <Mail className="h-4 w-4" /> Envoyer un mail
                    </Link>
                    <button
                      type="button"
                      onClick={() => startEdit(selected)}
                      className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
                    >
                      Modifier la fiche
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(selected.id, selected.name.trim() || selected.email)}
                      disabled={deleteMutation.isPending}
                      className="rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Sélectionnez un contact dans la liste.</p>
              )}
            </div>
          </>
        )}
      </div>
      </>
      ) : null}
    </div>
  )
}
