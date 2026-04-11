import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Mail, Phone, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import {
  fetchContacts,
  createContact,
  updateContact,
  deleteContact,
  type ContactResponse,
} from '../../api'
import { recordContactVisit } from '../../lib/hubVisits'

export default function ContactsPage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: contacts = [], isLoading, isError, error } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => fetchContacts(accessToken!),
    enabled: !!accessToken,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    )
  }, [contacts, search])

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
        <button
          type="button"
          onClick={() => { cancelForm(); setShowForm(true) }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
        >
          <Plus className="h-5 w-5" />
          Nouveau contact
        </button>
      </div>

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
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.email}</p>
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
                      onClick={() => deleteMutation.mutate(selected.id)}
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
    </div>
  )
}
