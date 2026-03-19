import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Mail, Phone, User, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import {
  fetchContacts,
  createContact,
  updateContact,
  deleteContact,
  type ContactResponse,
} from '../../api'

export default function ContactsPage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')

  const { data: contacts = [], isLoading, isError, error } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => fetchContacts(accessToken!),
    enabled: !!accessToken,
  })

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
    <div className="space-y-6">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Contacts</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Carnet d'adresses. Les contacts sont proposés comme destinataires dans Mail.
          </p>
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">
        {isError && (
          <div className="p-4 text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Erreur de chargement'}
          </div>
        )}
        {isLoading && (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Chargement…</div>
        )}
        {!isLoading && !isError && contacts.length === 0 && (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <Users className="h-12 w-12 text-slate-300 dark:text-slate-500 mb-4" />
            <p className="text-slate-600 dark:text-slate-300">Aucun contact. Ajoutez-en un pour les retrouver comme destinataires dans Mail.</p>
          </div>
        )}
        {!isLoading && !isError && contacts.length > 0 && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-600">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 hover:opacity-80"
                >
                  <User className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => startEdit(c)} className="min-w-0 flex-1 text-left">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                    <Mail className="h-4 w-4 shrink-0" />
                    {c.email}
                  </p>
                  {c.phone && (
                    <p className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                      <Phone className="h-4 w-4 shrink-0" />
                      {c.phone}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(c.id)}
                  disabled={deleteMutation.isPending}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label="Supprimer"
                >
                  <X className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
