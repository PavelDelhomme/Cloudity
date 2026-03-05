import React, { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Inbox, Send, FileText, X, PenLine, Paperclip, FolderOpen, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import { useNotifications } from '../../notificationsContext'
import {
  fetchDriveNodes,
  fetchMailAccounts,
  createMailAccount,
  deleteMailAccount,
  fetchMailMessages,
  syncMailAccount,
  sendMailMessage,
  getMailGoogleOAuthRedirectUrl,
  type DriveNode,
} from '../../api'

const STORAGE_RECENT_RECIPIENTS = 'cloudity_mail_recent_recipients'

type FolderId = 'inbox' | 'sent' | 'drafts'

const FOLDERS: { id: FolderId; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Boîte de réception', icon: Inbox },
  { id: 'sent', label: 'Envoyés', icon: Send },
  { id: 'drafts', label: 'Brouillons', icon: FileText },
]

type AttachmentFromDrive = { nodeId: number; name: string; size: number }

function getRecentRecipients(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_RECIPIENTS)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr.slice(0, 20) : []
  } catch {
    return []
  }
}

function addRecentRecipient(email: string) {
  const recent = getRecentRecipients().filter((e) => e.toLowerCase() !== email.toLowerCase())
  recent.unshift(email)
  localStorage.setItem(STORAGE_RECENT_RECIPIENTS, JSON.stringify(recent.slice(0, 20)))
}

export default function MailPage() {
  const { accessToken } = useAuth()
  const notifications = useNotifications()
  const queryClient = useQueryClient()
  const [showConnectEmail, setShowConnectEmail] = useState(false)
  const [connectEmailValue, setConnectEmailValue] = useState('')
  const [connectPassword, setConnectPassword] = useState('')
  const [connectLabel, setConnectLabel] = useState('')
  const [connectingAndSyncing, setConnectingAndSyncing] = useState(false)
  const [activeFolder, setActiveFolder] = useState<FolderId>('inbox')
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [attachments, setAttachments] = useState<AttachmentFromDrive[]>([])
  const [showDrivePicker, setShowDrivePicker] = useState(false)
  const [drivePickerParentId, setDrivePickerParentId] = useState<number | null>(null)
  const [drivePickerPath, setDrivePickerPath] = useState<{ id: number; name: string }[]>([])
  const [sending, setSending] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncAccountId, setSyncAccountId] = useState<number | null>(null)
  const [syncPassword, setSyncPassword] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [composePassword, setComposePassword] = useState('')
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: accountsData, isLoading: accountsLoading, isError: accountsError, error: accountsErrorDetail } = useQuery({
    queryKey: ['mail', 'accounts'],
    queryFn: () => fetchMailAccounts(accessToken!),
    enabled: !!accessToken,
    retry: (_, err) => {
      const msg = err instanceof Error ? err.message : String(err)
      return !msg.includes('401') && !msg.includes('404')
    },
  })
  const accounts = Array.isArray(accountsData) ? accountsData : (accountsData ?? [])
  const is404 = accountsError && accountsErrorDetail instanceof Error && accountsErrorDetail.message.includes('404')

  const firstAccountId = accounts[0]?.id ?? null
  const effectiveAccountId = selectedAccountId ?? firstAccountId

  const { data: messagesData } = useQuery({
    queryKey: ['mail', 'messages', effectiveAccountId, activeFolder],
    queryFn: () => fetchMailMessages(accessToken!, effectiveAccountId!, activeFolder),
    enabled: !!accessToken && effectiveAccountId != null,
  })
  const messages = Array.isArray(messagesData) ? messagesData : (messagesData ?? [])

  const { data: driveNodes = [], isLoading: driveNodesLoading } = useQuery({
    queryKey: ['drive', 'nodes', drivePickerParentId],
    queryFn: () => fetchDriveNodes(accessToken!, drivePickerParentId),
    enabled: showDrivePicker && !!accessToken,
  })

  const recentRecipients = getRecentRecipients()

  useEffect(() => {
    const oauth = searchParams.get('oauth')
    const status = searchParams.get('status')
    if (oauth !== 'google') return
    const reason = searchParams.get('reason')
    setSearchParams({}, { replace: true })
    queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] })
    queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
    if (status === 'ok') {
      toast.success('Compte Gmail connecté. Vous pouvez synchroniser la boîte.')
    } else {
      toast.error(reason === 'config' ? 'Connexion Google non configurée sur ce serveur.' : 'Connexion Google annulée ou erreur.')
    }
  }, [searchParams, setSearchParams, queryClient])

  const handleConnectGoogle = useCallback(async () => {
    if (!accessToken) return
    setGoogleConnecting(true)
    try {
      const { redirect_url } = await getMailGoogleOAuthRedirectUrl(accessToken)
      window.location.href = redirect_url
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('non configuré') || msg.includes('503')) {
        toast.error('La connexion Google n’est pas encore activée sur ce serveur. Utilisez « Ajouter une boîte » avec un mot de passe d’application Gmail (voir aide).', { duration: 6000 })
        setShowConnectEmail(true)
      } else {
        toast.error(msg || 'Erreur')
      }
    } finally {
      setGoogleConnecting(false)
    }
  }, [accessToken])

  const handleConnectEmail = useCallback(async () => {
    const email = connectEmailValue.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Adresse e-mail invalide')
      return
    }
    const password = connectPassword.trim()
    if (!password) {
      toast.error('Indiquez le mot de passe du compte (il sera stocké de façon sécurisée pour la synchro).')
      return
    }
    if (!accessToken) return
    setConnectingAndSyncing(true)
    try {
      const created = await createMailAccount(accessToken, email, {
        label: connectLabel.trim() || undefined,
        password,
      })
      setShowConnectEmail(false)
      setConnectEmailValue('')
      setConnectPassword('')
      setConnectLabel('')
      queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] })
      toast.success('Boîte mail ajoutée.')
      notifications?.addNotification({
        title: 'Boîte mail ajoutée',
        message: `${email} est reliée. Synchronisation en cours…`,
        type: 'success',
      })
      setSelectedAccountId(created.id)
      const syncRes = await syncMailAccount(accessToken, created.id, '')
      queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
      toast.success(syncRes.synced > 0 ? `${syncRes.synced} message(s) récupéré(s)` : syncRes.message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setConnectingAndSyncing(false)
    }
  }, [connectEmailValue, connectPassword, connectLabel, accessToken, queryClient, notifications])

  const handleDisconnectAccount = useCallback(
    (accountId: number, email: string) => {
      if (!accessToken) return
      deleteMailAccount(accessToken, accountId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] })
          queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
          if (selectedAccountId === accountId) setSelectedAccountId(null)
          toast.success('Adresse déconnectée')
          notifications?.addNotification({
            title: 'Adresse mail déconnectée',
            message: `${email} n'est plus reliée à ce compte.`,
            type: 'info',
          })
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
    },
    [accessToken, queryClient, notifications, selectedAccountId]
  )

  const handleSyncAccount = useCallback(() => {
    if (!syncAccountId || !accessToken) return
    setSyncing(true)
    syncMailAccount(accessToken, syncAccountId, syncPassword.trim() || undefined)
      .then((r) => {
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        toast.success(r.synced > 0 ? `${r.synced} message(s) synchronisé(s)` : r.message)
        setShowSyncModal(false)
        setSyncAccountId(null)
        setSyncPassword('')
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur de synchronisation'))
      .finally(() => setSyncing(false))
  }, [syncAccountId, syncPassword, accessToken, queryClient])

  const handleSendMessage = useCallback(async () => {
    if (!composeTo.trim()) {
      toast.error('Indiquez un destinataire')
      return
    }
    if (!effectiveAccountId || !accessToken) {
      toast.error('Aucun compte mail sélectionné')
      return
    }
    setSending(true)
    try {
      addRecentRecipient(composeTo.trim())
      let body = composeBody
      if (attachments.length > 0) {
        body += '\n\n--- Pièces jointes (Drive) ---\n'
        attachments.forEach((a) => {
          body += `• ${a.name} (${(a.size / 1024).toFixed(1)} Ko) — lien de téléchargement à configurer côté serveur\n`
        })
      }
      await sendMailMessage(accessToken, {
        account_id: effectiveAccountId,
        password: composePassword,
        to: composeTo.trim(),
        subject: composeSubject,
        body,
      })
      toast.success('Message envoyé')
      setShowCompose(false)
      setComposeTo('')
      setComposeSubject('')
      setComposeBody('')
      setComposePassword('')
      setAttachments([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur d’envoi')
    } finally {
      setSending(false)
    }
  }, [composeTo, composeSubject, composeBody, composePassword, effectiveAccountId, accessToken, attachments])

  const addAttachmentFromDrive = useCallback((node: DriveNode) => {
    if (node.is_folder) return
    setAttachments((prev) => {
      if (prev.some((a) => a.nodeId === node.id)) return prev
      return [...prev, { nodeId: node.id, name: node.name, size: node.size }]
    })
    toast.success(`« ${node.name } » ajouté`)
  }, [])

  const removeAttachment = useCallback((nodeId: number) => {
    setAttachments((prev) => prev.filter((a) => a.nodeId !== nodeId))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Mail</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {accounts.length > 0
              ? `${accounts.length} boîte(s) mail. Sélectionnez une boîte et un dossier, ou synchronisez pour récupérer les messages.`
              : 'Aucune boîte mail. Ajoutez une adresse (avec mot de passe) pour lire et envoyer les e-mails.'}
          </p>
        </div>
      </div>

      {is404 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4" role="alert">
          <p className="font-medium text-red-800 dark:text-red-200">Le service Mail ne répond pas (404).</p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            En terminal, exécutez : <code className="bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 rounded">make rebuild-mail</code> puis rechargez cette page.
          </p>
        </div>
      )}

      {accountsLoading && !is404 && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Chargement des comptes…</span>
        </div>
      )}

      {!accountsLoading && !is404 && accounts.length === 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-amber-800 dark:text-amber-200 font-medium">Aucune boîte mail reliée à ce compte.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={googleConnecting}
              className="rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-500 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2 disabled:opacity-50"
            >
              {googleConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Se connecter avec Google
            </button>
            <button
              type="button"
              onClick={() => setShowConnectEmail(true)}
              className="rounded-lg bg-amber-600 dark:bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-600"
            >
              + Ajouter une boîte
            </button>
          </div>
        </div>
      )}

      {!accountsLoading && !is404 && accounts.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Sélectionnez une boîte dans la barre latérale pour afficher ses dossiers et messages.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={googleConnecting}
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:underline disabled:opacity-50 flex items-center gap-1"
            >
              {googleConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Se connecter avec Google
            </button>
            <span className="text-slate-300 dark:text-slate-500">|</span>
            <button
              type="button"
              onClick={() => setShowConnectEmail(true)}
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              + Ajouter une boîte mail
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col min-h-[480px]">
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 min-w-0">
          <aside className="md:col-span-3 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/30 p-3 flex flex-col gap-2 min-h-0 min-w-0 overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowCompose(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-2.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600"
            >
              <PenLine className="h-4 w-4" />
              Nouveau message
            </button>
            <div className="border-t border-slate-200 dark:border-slate-600 pt-2">
              <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Boîtes mail</p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={googleConnecting}
                  className="w-full rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-left flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {googleConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Se connecter avec Google
                </button>
                <button type="button" onClick={() => setShowConnectEmail(true)} className="w-full rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-left flex items-center justify-center gap-2">
                  + Ajouter une boîte
                </button>
              </div>
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center gap-1 rounded-lg group">
                  <button
                    type="button"
                    onClick={() => { setSelectedAccountId(acc.id); setActiveFolder('inbox') }}
                    className={`flex-1 min-w-0 text-left rounded-lg px-3 py-2 text-sm font-medium truncate transition-colors ${
                      effectiveAccountId === acc.id
                        ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                    title={acc.email}
                  >
                    {acc.label || acc.email}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSyncAccountId(acc.id); setSyncPassword(''); setShowSyncModal(true) }}
                    className="p-2 rounded-lg text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-600 shrink-0"
                    title="Synchroniser"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnectAccount(acc.id, acc.email)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-600 shrink-0"
                    title="Déconnecter"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 dark:border-slate-600 pt-2">
              <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Dossiers</p>
              {FOLDERS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveFolder(id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeFolder === id ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </aside>
          <div className="md:col-span-9 flex flex-col min-h-0">
            <div className="border-b border-slate-200 dark:border-slate-600 px-4 py-3 bg-white dark:bg-slate-800 flex flex-col gap-0.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {FOLDERS.find((f) => f.id === activeFolder)?.label ?? 'Messages'}
              </span>
              {effectiveAccountId != null && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {accounts.find((a) => a.id === effectiveAccountId)?.email}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {messages.length > 0 ? (
                <ul className="divide-y divide-slate-200 dark:divide-slate-600">
                  {messages.map((msg) => (
                    <li key={msg.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{msg.subject || '(Sans objet)'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        De : {msg.from} — {msg.date_at ? new Date(msg.date_at).toLocaleString('fr-FR') : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <Mail className="h-12 w-12 text-slate-300 dark:text-slate-500" />
                  <p className="mt-4 text-slate-600 dark:text-slate-300">Aucun message</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                    Les messages seront affichés ici une fois IMAP connecté et la synchro activée.
                  </p>
                  <button type="button" onClick={() => setShowCompose(true)} className="mt-4 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                    Écrire un message
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConnectEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6 my-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Ajouter une boîte mail</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Saisissez l’adresse et le mot de passe. Le mot de passe est stocké de façon sécurisée pour la synchronisation (IMAP) et l’envoi (SMTP).
            </p>
            {/^[^@]*@gmail\.com$/i.test(connectEmailValue.trim()) && (
              <div className="mb-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">Gmail : comme Thunderbird ou BlueMail</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                  Utilisez un <strong>mot de passe d'application</strong> (pas votre mot de passe Gmail). Un clic dans votre compte Google, aucune config technique :
                </p>
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 underline hover:no-underline"
                >
                  Créer un mot de passe d'application →
                </a>
              </div>
            )}
            <div className="space-y-3 mb-4">
              <input
                type="email"
                value={connectEmailValue}
                onChange={(e) => setConnectEmailValue(e.target.value)}
                placeholder="vous@gmail.com"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
              />
              <input
                type="password"
                value={connectPassword}
                onChange={(e) => setConnectPassword(e.target.value)}
                placeholder="Mot de passe (ou mot de passe d’application Gmail)"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
              />
              <input
                type="text"
                value={connectLabel}
                onChange={(e) => setConnectLabel(e.target.value)}
                placeholder="Libellé (optionnel)"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowConnectEmail(false); setConnectEmailValue(''); setConnectPassword(''); setConnectLabel('') }} disabled={connectingAndSyncing} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                Annuler
              </button>
              <button type="button" onClick={handleConnectEmail} disabled={connectingAndSyncing || !connectEmailValue.trim() || !connectPassword.trim()} className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2">
                {connectingAndSyncing ? <><Loader2 className="h-4 w-4 animate-spin" /> Ajout et synchro…</> : 'Ajouter et synchroniser'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-labelledby="compose-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h2 id="compose-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nouveau message</h2>
              <button type="button" onClick={() => setShowCompose(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <label htmlFor="mail-to" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Destinataire</label>
                <input
                  id="mail-to"
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  list="mail-recent-recipients"
                  placeholder="email@exemple.fr"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                <datalist id="mail-recent-recipients">
                  {recentRecipients.map((email) => (
                    <option key={email} value={email} />
                  ))}
                </datalist>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Les contacts (app Contacts) seront proposés ici lorsqu’ils seront disponibles.</p>
              </div>
              <div>
                <label htmlFor="mail-subject" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Objet</label>
                <input
                  id="mail-subject"
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Objet du message"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="mail-body" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Message</label>
                  <button
                    type="button"
                    onClick={() => { setDrivePickerParentId(null); setDrivePickerPath([]); setShowDrivePicker(true) }}
                    className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <Paperclip className="h-4 w-4" />
                    Joindre depuis le Drive
                  </button>
                </div>
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {attachments.map((a) => (
                      <span
                        key={a.nodeId}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300"
                      >
                        {a.name}
                        <button type="button" onClick={() => removeAttachment(a.nodeId)} className="rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  id="mail-body"
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Saisissez votre message…"
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                />
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Fichiers lourds : un lien de téléchargement pourra être généré à la place d’une pièce jointe directe.</p>
              </div>
              <div>
                <label htmlFor="mail-smtp-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mot de passe du compte (SMTP)</label>
                <input
                  id="mail-smtp-password"
                  type="password"
                  value={composePassword}
                  onChange={(e) => setComposePassword(e.target.value)}
                  placeholder="Mot de passe ou mot de passe d'application"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t border-slate-200 dark:border-slate-600">
              <button type="button" onClick={() => setShowCompose(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Annuler
              </button>
              <button type="button" onClick={handleSendMessage} disabled={sending} className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50">
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Synchroniser la boîte mail</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Si un mot de passe a été enregistré à l’ajout de la boîte, laissez vide. Sinon, saisissez le mot de passe (ou mot de passe d’application Gmail) pour cette synchro.
            </p>
            {syncAccountId != null && /@gmail\.com$/i.test(accounts.find((a) => a.id === syncAccountId)?.email ?? '') && (
              <p className="mb-4 text-xs text-amber-700 dark:text-amber-300">
                Gmail avec 2FA : utilisez un{' '}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  mot de passe d'application
                </a>
                .
              </p>
            )}
            <input
              type="password"
              value={syncPassword}
              onChange={(e) => setSyncPassword(e.target.value)}
              placeholder="Mot de passe"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowSyncModal(false); setSyncAccountId(null); setSyncPassword('') }} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300">
                Annuler
              </button>
              <button type="button" onClick={handleSyncAccount} disabled={syncing} className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white disabled:opacity-50">
                {syncing ? 'Synchronisation…' : 'Synchroniser'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDrivePicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Choisir un fichier (Drive)</h3>
              <button type="button" onClick={() => setShowDrivePicker(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-2 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-1 text-sm">
              <button type="button" onClick={() => { setDrivePickerParentId(null); setDrivePickerPath([]) }} className="text-brand-600 dark:text-brand-400 hover:underline">
                Racine
              </button>
              {drivePickerPath.map((p, i) => (
                <span key={p.id}>
                  <span className="text-slate-400 mx-1">/</span>
                  <button type="button" onClick={() => { setDrivePickerParentId(p.id); setDrivePickerPath(drivePickerPath.slice(0, i + 1)) }} className="text-brand-600 dark:text-brand-400 hover:underline truncate max-w-[120px]">
                    {p.name}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-2">
              {driveNodesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : (
                <ul className="space-y-1">
                  {driveNodes.filter((n) => n.is_folder).map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => { setDrivePickerParentId(node.id); setDrivePickerPath((prev) => [...prev, { id: node.id, name: node.name }]) }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <FolderOpen className="h-5 w-5 text-amber-500" />
                        {node.name}
                      </button>
                    </li>
                  ))}
                  {driveNodes.filter((n) => !n.is_folder).map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => addAttachmentFromDrive(node)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <Paperclip className="h-5 w-5 text-slate-400" />
                        {node.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
