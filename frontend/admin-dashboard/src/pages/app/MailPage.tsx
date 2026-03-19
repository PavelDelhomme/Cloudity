import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Inbox, Send, FileText, X, PenLine, Paperclip, FolderOpen, Loader2, RefreshCw, Settings, AlertTriangle, ChevronLeft, ChevronRight, Reply, Forward, Minimize2, Maximize2, Trash2, MoreVertical, CheckSquare, Square, Edit2, MailOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import { useNotifications } from '../../notificationsContext'
import {
  fetchDriveNodes,
  fetchMailAccounts,
  createMailAccount,
  deleteMailAccount,
  fetchMailMessages,
  fetchMailMessage,
  markMailMessageRead,
  moveMailMessageToFolder,
  syncMailAccount,
  sendMailMessage,
  getMailGoogleOAuthRedirectUrl,
  fetchContacts,
  updateMailAccount,
  type DriveNode,
  type MailMessageResponse,
  type MailFolderId,
} from '../../api'

const STORAGE_RECENT_RECIPIENTS = 'cloudity_mail_recent_recipients'
const STORAGE_MAIL_SIGNATURE = 'cloudity_mail_signature'
const STORAGE_SIDEBAR_COLLAPSED = 'cloudity_mail_sidebar_collapsed'
const STORAGE_DRAFT_PREFIX = 'cloudity_mail_draft_'
const MESSAGES_PAGE_SIZE = 25

type DraftLocal = { to: string; subject: string; body: string; updatedAt: string }

function getDraftKey(accountId: number | null): string {
  return `${STORAGE_DRAFT_PREFIX}${accountId ?? 0}`
}

function getMailSignature(): string {
  try {
    return localStorage.getItem(STORAGE_MAIL_SIGNATURE) || ''
  } catch {
    return ''
  }
}

function getSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED) === '1'
  } catch {
    return false
  }
}

function loadDraftLocal(accountId: number | null): DraftLocal | null {
  try {
    const raw = localStorage.getItem(getDraftKey(accountId))
    if (!raw) return null
    return JSON.parse(raw) as DraftLocal
  } catch {
    return null
  }
}

function saveDraftLocal(accountId: number | null, draft: { to: string; subject: string; body: string } | null): void {
  try {
    const key = getDraftKey(accountId)
    if (!draft || (!draft.to.trim() && !draft.subject.trim() && !draft.body.trim())) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }))
  } catch { /* ignore */ }
}

const FOLDERS: { id: MailFolderId; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Boîte de réception', icon: Inbox },
  { id: 'sent', label: 'Envoyés', icon: Send },
  { id: 'drafts', label: 'Brouillons', icon: FileText },
  { id: 'spam', label: 'Spam', icon: AlertTriangle },
  { id: 'trash', label: 'Corbeille', icon: Trash2 },
]

type AttachmentFromDrive = { nodeId: number; name: string; size: number }

export type ComposeSlot = {
  id: string
  to: string
  subject: string
  body: string
  minimized: boolean
  attachments: AttachmentFromDrive[]
}

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
  const e = email.trim()
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return
  const recent = getRecentRecipients().filter((r) => r.toLowerCase() !== e.toLowerCase())
  recent.unshift(e)
  localStorage.setItem(STORAGE_RECENT_RECIPIENTS, JSON.stringify(recent.slice(0, 20)))
}

/** Extrait l'adresse email depuis "Name <email>" ou renvoie la chaîne si déjà une adresse. */
function extractEmailFromSender(from: string | undefined): string | null {
  if (!from?.trim()) return null
  const m = /<([^>]+)>/.exec(from)
  const email = m ? m[1].trim() : from.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function formatMessageDate(dateAt: string | undefined): string {
  if (!dateAt) return ''
  const d = new Date(dateAt)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3600_000)
  const diffDays = Math.floor(diffMs / 86400_000)
  if (diffMins < 1) return 'À l\'instant'
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours} h`
  if (diffDays < 7) return `Il y a ${diffDays} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
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
  const [activeFolder, setActiveFolder] = useState<MailFolderId>('inbox')
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [composeSlots, setComposeSlots] = useState<ComposeSlot[]>([])
  const [activeComposeId, setActiveComposeId] = useState<string | null>(null)
  const [showDrivePicker, setShowDrivePicker] = useState(false)
  const [drivePickerParentId, setDrivePickerParentId] = useState<number | null>(null)
  const [drivePickerPath, setDrivePickerPath] = useState<{ id: number; name: string }[]>([])
  const [sending, setSending] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncAccountId, setSyncAccountId] = useState<number | null>(null)
  const [syncPassword, setSyncPassword] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [messagePage, setMessagePage] = useState(0)
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
  const [showMailSettings, setShowMailSettings] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getSidebarCollapsed)
  const [drivePickerForComposeId, setDrivePickerForComposeId] = useState<string | null>(null)
  const [mailSignature, setMailSignature] = useState(getMailSignature())
  const [messageMenuOpenId, setMessageMenuOpenId] = useState<number | null>(null)
  const [contextMenuMessage, setContextMenuMessage] = useState<{ id: number; x: number; y: number } | null>(null)
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([])
  const [bulkWorking, setBulkWorking] = useState(false)
  const [showEditAccountModal, setShowEditAccountModal] = useState(false)
  const [editAccountId, setEditAccountId] = useState<number | null>(null)
  const [editAccLabel, setEditAccLabel] = useState('')
  const [editAccPassword, setEditAccPassword] = useState('')
  const [editAccImapHost, setEditAccImapHost] = useState('')
  const [editAccImapPort, setEditAccImapPort] = useState('')
  const [editAccSmtpHost, setEditAccSmtpHost] = useState('')
  const [editAccSmtpPort, setEditAccSmtpPort] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)

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

  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: ['mail', 'messages', effectiveAccountId, activeFolder, messagePage],
    queryFn: () => fetchMailMessages(accessToken!, effectiveAccountId!, activeFolder, { limit: MESSAGES_PAGE_SIZE, offset: messagePage * MESSAGES_PAGE_SIZE }),
    enabled: !!accessToken && effectiveAccountId != null,
    refetchOnWindowFocus: true,
  })
  const messages = messagesData?.messages ?? []
  const messagesTotal = messagesData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(messagesTotal / MESSAGES_PAGE_SIZE) || 1)
  const hasNextPage = (messagePage + 1) * MESSAGES_PAGE_SIZE < messagesTotal
  const allMessagesSelectedOnPage = messages.length > 0 && messages.every((m) => selectedMessageIds.includes(m.id))
  const [refreshingFromServer, setRefreshingFromServer] = useState(false)
  const lastSyncAtRef = useRef<number>(0)
  const MAIL_SYNC_THROTTLE_MS = 30_000

  const { data: selectedMessageDetail, isLoading: selectedMessageLoading } = useQuery({
    queryKey: ['mail', 'message', effectiveAccountId, selectedMessageId],
    queryFn: () => fetchMailMessage(accessToken!, effectiveAccountId!, selectedMessageId!),
    enabled: !!accessToken && effectiveAccountId != null && selectedMessageId != null,
  })

  const { data: driveNodes = [], isLoading: driveNodesLoading } = useQuery({
    queryKey: ['drive', 'nodes', drivePickerParentId],
    queryFn: () => fetchDriveNodes(accessToken!, drivePickerParentId),
    enabled: showDrivePicker && !!accessToken,
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => fetchContacts(accessToken!),
    enabled: !!accessToken && composeSlots.length > 0,
  })

  const recentRecipients = getRecentRecipients()
  const sendersFromMessages = useMemo(
    () => Array.from(new Set(messages.map((m) => m.from).filter((e): e is string => !!e && e.trim() !== ''))),
    [messages]
  )
  const recipientSuggestions = Array.from(new Set([...recentRecipients, ...contacts.map((c) => c.email), ...sendersFromMessages]))

  useEffect(() => {
    setSelectedMessageId(null)
    setMessagePage(0)
  }, [effectiveAccountId, activeFolder])

  useEffect(() => {
    setSelectedMessageIds([])
  }, [effectiveAccountId, activeFolder, messagePage])

  /** À l'ouverture de la boîte mail (ou au changement de compte), sync IMAP puis rafraîchir la liste. */
  useEffect(() => {
    if (!accessToken || effectiveAccountId == null) return
    let cancelled = false
    syncMailAccount(accessToken, effectiveAccountId, undefined)
      .then((r) => {
        if (cancelled) return
        lastSyncAtRef.current = Date.now()
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        refetchMessages()
        if (r.synced > 0 && notifications) {
          notifications.addNotification({
            title: 'Boîte mail',
            message: r.synced === 1 ? '1 nouveau message' : `${r.synced} nouveaux messages`,
            type: 'info',
          })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [effectiveAccountId, accessToken, queryClient, refetchMessages, notifications])

  /** Polling : toutes les 60 s, sync IMAP puis notifier si nouveaux messages. */
  useEffect(() => {
    if (!accessToken || effectiveAccountId == null) return
    const interval = setInterval(() => {
      syncMailAccount(accessToken, effectiveAccountId!, undefined)
        .then((r) => {
          queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
          refetchMessages()
          if (r.synced > 0 && notifications) {
            notifications.addNotification({
              title: 'Boîte mail',
              message: r.synced === 1 ? '1 nouveau message' : `${r.synced} nouveaux messages`,
              type: 'info',
            })
          }
        })
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [effectiveAccountId, accessToken, queryClient, refetchMessages, notifications])

  /** Au retour sur l'onglet (visibility), sync si dernier sync > 30 s, puis notifier si nouveaux messages. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !accessToken || effectiveAccountId == null) return
      if (Date.now() - lastSyncAtRef.current < MAIL_SYNC_THROTTLE_MS) return
      syncMailAccount(accessToken, effectiveAccountId, undefined)
        .then((r) => {
          lastSyncAtRef.current = Date.now()
          queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
          refetchMessages()
          if (r.synced > 0 && notifications) {
            notifications.addNotification({
              title: 'Boîte mail',
              message: r.synced === 1 ? '1 nouveau message' : `${r.synced} nouveaux messages`,
              type: 'info',
            })
          }
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [effectiveAccountId, accessToken, queryClient, refetchMessages, notifications])

  useEffect(() => {
    if (!messageMenuOpenId && !contextMenuMessage) return
    const close = () => {
      setMessageMenuOpenId(null)
      setContextMenuMessage(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => document.addEventListener('click', close, true), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      document.removeEventListener('click', close, true)
    }
  }, [messageMenuOpenId, contextMenuMessage])

  const activeSlot = composeSlots.find((s) => s.id === activeComposeId) ?? composeSlots[composeSlots.length - 1] ?? null

  const openNewCompose = useCallback(
    (initial?: { to?: string; subject?: string; body?: string }) => {
      setComposeSlots((prev) => {
        const wasEmpty = prev.length === 0
        const draft = wasEmpty && effectiveAccountId != null ? loadDraftLocal(effectiveAccountId) : null
        const id = `compose-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const slot: ComposeSlot = {
          id,
          to: initial?.to ?? draft?.to ?? '',
          subject: initial?.subject ?? draft?.subject ?? '',
          body: initial?.body ?? draft?.body ?? '',
          minimized: false,
          attachments: [],
        }
        setActiveComposeId(id)
        return [...prev, slot]
      })
    },
    [effectiveAccountId]
  )

  const closeSlot = useCallback(
    (id: string) => {
      const slot = composeSlots.find((s) => s.id === id)
      if (slot && effectiveAccountId != null) saveDraftLocal(effectiveAccountId, { to: slot.to, subject: slot.subject, body: slot.body })
      setComposeSlots((prev) => {
        const next = prev.filter((s) => s.id !== id)
        setActiveComposeId((cur) => (cur === id ? (next[next.length - 1]?.id ?? null) : cur))
        return next
      })
      if (drivePickerForComposeId === id) setShowDrivePicker(false)
      setDrivePickerForComposeId((cur) => (cur === id ? null : cur))
    },
    [composeSlots, effectiveAccountId, drivePickerForComposeId]
  )

  const updateSlot = useCallback((id: string, patch: Partial<Pick<ComposeSlot, 'to' | 'subject' | 'body' | 'minimized'>>) => {
    setComposeSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const setActiveAndExpand = useCallback((id: string) => {
    setActiveComposeId(id)
    setComposeSlots((prev) => prev.map((s) => ({ ...s, minimized: s.id === id ? false : s.minimized })))
  }, [])

  // Auto-save brouillon du slot actif toutes les 3 s
  useEffect(() => {
    if (!activeSlot || effectiveAccountId == null) return
    const t = setInterval(() => {
      saveDraftLocal(effectiveAccountId, { to: activeSlot.to, subject: activeSlot.subject, body: activeSlot.body })
    }, 3000)
    return () => clearInterval(t)
  }, [activeSlot?.id, effectiveAccountId, activeSlot?.to, activeSlot?.subject, activeSlot?.body])

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
      // Utiliser le même mot de passe que à la création pour la 1ère sync (évite un round-trip chiffrement/déchiffrement)
      const syncRes = await syncMailAccount(accessToken, created.id, password)
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

  /** Récupère les nouveaux messages depuis le serveur IMAP puis rafraîchit la liste (sans ouvrir la modale). */
  const handleRefreshFromServer = useCallback(() => {
    if (!effectiveAccountId || !accessToken) return
    setRefreshingFromServer(true)
    syncMailAccount(accessToken, effectiveAccountId, undefined)
      .then((r) => {
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        refetchMessages()
        toast.success(r.synced > 0 ? `${r.synced} nouveau(x) message(s) récupéré(s)` : r.message || 'Liste à jour')
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur lors de l’actualisation'))
      .finally(() => setRefreshingFromServer(false))
  }, [effectiveAccountId, accessToken, queryClient, refetchMessages])

  const [movingMessageId, setMovingMessageId] = useState<number | null>(null)
  const handleMoveToFolder = useCallback(
    async (messageId: number, folder: MailFolderId) => {
      if (!effectiveAccountId || !accessToken) return
      setMovingMessageId(messageId)
      try {
        await moveMailMessageToFolder(accessToken, effectiveAccountId, messageId, folder)
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        if (selectedMessageId === messageId) setSelectedMessageId(null)
        const label = FOLDERS.find((f) => f.id === folder)?.label ?? folder
        toast.success(`Message déplacé vers ${label}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setMovingMessageId(null)
      }
    },
    [effectiveAccountId, accessToken, queryClient, selectedMessageId]
  )

  const toggleMessageSelected = useCallback((id: number) => {
    setSelectedMessageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const selectAllMessagesOnPage = useCallback(() => {
    setSelectedMessageIds(messages.map((m) => m.id))
  }, [messages])

  const clearMessageSelection = useCallback(() => setSelectedMessageIds([]), [])

  const handleToggleSelectAllOnPage = useCallback(() => {
    if (allMessagesSelectedOnPage) clearMessageSelection()
    else selectAllMessagesOnPage()
  }, [allMessagesSelectedOnPage, clearMessageSelection, selectAllMessagesOnPage])

  const handleBulkMove = useCallback(
    async (folder: MailFolderId) => {
      if (!effectiveAccountId || !accessToken || selectedMessageIds.length === 0) return
      const n = selectedMessageIds.length
      setBulkWorking(true)
      try {
        await Promise.all(
          selectedMessageIds.map((id) => moveMailMessageToFolder(accessToken, effectiveAccountId, id, folder))
        )
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        setSelectedMessageIds([])
        setSelectedMessageId(null)
        const label = FOLDERS.find((f) => f.id === folder)?.label ?? folder
        toast.success(`${n} message(s) déplacé(s) vers ${label}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setBulkWorking(false)
      }
    },
    [effectiveAccountId, accessToken, selectedMessageIds, queryClient]
  )

  const handleBulkMarkRead = useCallback(
    async (read: boolean) => {
      if (!effectiveAccountId || !accessToken || selectedMessageIds.length === 0) return
      setBulkWorking(true)
      try {
        await Promise.all(
          selectedMessageIds.map((id) => markMailMessageRead(accessToken, effectiveAccountId, id, read))
        )
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        toast.success(read ? 'Marqué comme lu' : 'Marqué comme non lu')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setBulkWorking(false)
      }
    },
    [effectiveAccountId, accessToken, selectedMessageIds, queryClient]
  )

  const openEditAccountModal = useCallback(
    (accountId: number) => {
      const acc = accounts.find((a) => a.id === accountId)
      setEditAccountId(accountId)
      setEditAccLabel(acc?.label || '')
      setEditAccPassword('')
      setEditAccImapHost(acc?.imap_host ?? '')
      setEditAccImapPort(acc?.imap_port != null ? String(acc.imap_port) : '')
      setEditAccSmtpHost(acc?.smtp_host ?? '')
      setEditAccSmtpPort(acc?.smtp_port != null ? String(acc.smtp_port) : '')
      setShowEditAccountModal(true)
    },
    [accounts]
  )

  const handleSaveAccountSettings = useCallback(async () => {
    if (!accessToken || editAccountId == null) return
    setSavingAccount(true)
    try {
      const patch: Parameters<typeof updateMailAccount>[2] = {}
      const acc = accounts.find((a) => a.id === editAccountId)
      if (editAccLabel.trim() !== (acc?.label || '').trim()) patch.label = editAccLabel.trim()
      if (editAccPassword.trim()) patch.password = editAccPassword.trim()
      const imapH = editAccImapHost.trim()
      const imapP = editAccImapPort.trim()
      if (imapH) {
        patch.imap_host = imapH
        const ip = parseInt(imapP, 10)
        patch.imap_port = Number.isFinite(ip) && ip > 0 ? ip : 993
      }
      const smtpH = editAccSmtpHost.trim()
      const smtpP = editAccSmtpPort.trim()
      if (smtpH) {
        patch.smtp_host = smtpH
        const sp = parseInt(smtpP, 10)
        patch.smtp_port = Number.isFinite(sp) && sp > 0 ? sp : 587
      }
      if (Object.keys(patch).length === 0) {
        toast.error('Modifiez au moins le libellé, le mot de passe ou les serveurs IMAP/SMTP.')
        setSavingAccount(false)
        return
      }
      await updateMailAccount(accessToken, editAccountId, patch)
      queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] })
      toast.success('Paramètres enregistrés. Lancez « Synchroniser » pour tester la connexion.')
      setShowEditAccountModal(false)
      setEditAccountId(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingAccount(false)
    }
  }, [
    accessToken,
    editAccountId,
    editAccLabel,
    editAccPassword,
    editAccImapHost,
    editAccImapPort,
    editAccSmtpHost,
    editAccSmtpPort,
    accounts,
    queryClient,
  ])

  const handleResetAccountServersAuto = useCallback(async () => {
    if (!accessToken || editAccountId == null) return
    setSavingAccount(true)
    try {
      await updateMailAccount(accessToken, editAccountId, {
        imap_host: '',
        imap_port: 0,
        smtp_host: '',
        smtp_port: 0,
      })
      queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] })
      toast.success('Serveurs remis sur détection automatique.')
      setEditAccImapHost('')
      setEditAccImapPort('')
      setEditAccSmtpHost('')
      setEditAccSmtpPort('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingAccount(false)
    }
  }, [accessToken, editAccountId, queryClient])

  const handleSelectMessage = useCallback(
    (msg: MailMessageResponse) => {
      setSelectedMessageId(msg.id)
      const senderEmail = extractEmailFromSender(msg.from)
      if (senderEmail) addRecentRecipient(senderEmail)
      if (!msg.is_read && accessToken && effectiveAccountId) {
        markMailMessageRead(accessToken, effectiveAccountId, msg.id, true)
          .then(() => queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] }))
          .catch(() => {})
      }
    },
    [accessToken, effectiveAccountId, queryClient]
  )

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, next ? '1' : '0')
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const handleReply = useCallback(() => {
    if (!selectedMessageDetail) return
    const subj = selectedMessageDetail.subject || ''
    const body = selectedMessageDetail.body_plain || selectedMessageDetail.body_html || ''
    const quoted = body
      ? `\n\nLe ${selectedMessageDetail.date_at ? new Date(selectedMessageDetail.date_at).toLocaleString('fr-FR') : ''}, ${selectedMessageDetail.from || ''} a écrit :\n${body.replace(/^/gm, '> ')}`
      : ''
    openNewCompose({
      to: selectedMessageDetail.from || '',
      subject: subj.startsWith('Re:') ? subj : `Re: ${subj}`,
      body: quoted,
    })
  }, [selectedMessageDetail, openNewCompose])

  const handleReplyAll = useCallback(() => {
    if (!selectedMessageDetail) return
    const toAddrs = (selectedMessageDetail.to || '').split(/,|;/).map((s) => s.trim()).filter(Boolean)
    const from = (selectedMessageDetail.from || '').trim()
    const me = accounts.find((a) => a.id === effectiveAccountId)?.email
    const others = [from, ...toAddrs].filter((a) => a && a.toLowerCase() !== me?.toLowerCase())
    const subj = selectedMessageDetail.subject || ''
    const body = selectedMessageDetail.body_plain || selectedMessageDetail.body_html || ''
    const quoted = body
      ? `\n\nLe ${selectedMessageDetail.date_at ? new Date(selectedMessageDetail.date_at).toLocaleString('fr-FR') : ''}, ${selectedMessageDetail.from || ''} a écrit :\n${body.replace(/^/gm, '> ')}`
      : ''
    openNewCompose({
      to: others.join(', '),
      subject: subj.startsWith('Re:') ? subj : `Re: ${subj}`,
      body: quoted,
    })
  }, [selectedMessageDetail, accounts, effectiveAccountId, openNewCompose])

  const handleForward = useCallback(() => {
    if (!selectedMessageDetail) return
    const subj = selectedMessageDetail.subject || ''
    const body = selectedMessageDetail.body_plain || selectedMessageDetail.body_html || ''
    const fwd = body
      ? `\n\n---------- Message transféré ----------\nDe : ${selectedMessageDetail.from || ''}\nÀ : ${selectedMessageDetail.to || ''}\nDate : ${selectedMessageDetail.date_at ? new Date(selectedMessageDetail.date_at).toLocaleString('fr-FR') : ''}\nObjet : ${selectedMessageDetail.subject || ''}\n\n${body}`
      : ''
    openNewCompose({
      to: '',
      subject: subj.startsWith('Fwd:') ? subj : `Fwd: ${subj}`,
      body: fwd,
    })
  }, [selectedMessageDetail, openNewCompose])

  const handleSendMessage = useCallback(
    async (slotId?: string) => {
      const slot = slotId ? composeSlots.find((s) => s.id === slotId) : activeSlot
      if (!slot) return
      if (!slot.to.trim()) {
        toast.error('Indiquez un destinataire')
        return
      }
      if (!effectiveAccountId || !accessToken) {
        toast.error('Aucun compte mail sélectionné')
        return
      }
      setSending(true)
      try {
        addRecentRecipient(slot.to.trim())
        let body = slot.body
        const sig = getMailSignature()
        if (sig && !body.trim().endsWith(sig.trim())) {
          body = body.trimEnd() + (body.trim() ? '\n\n' : '') + sig
        }
        if (slot.attachments.length > 0) {
          body += '\n\n--- Pièces jointes (Drive) ---\n'
          slot.attachments.forEach((a) => {
            body += `• ${a.name} (${(a.size / 1024).toFixed(1)} Ko) — lien de téléchargement à configurer côté serveur\n`
          })
        }
        await sendMailMessage(accessToken, {
          account_id: effectiveAccountId,
          to: slot.to.trim(),
          subject: slot.subject,
          body,
        })
        toast.success('Message envoyé')
        closeSlot(slot.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur d’envoi')
    } finally {
      setSending(false)
    }
  }, [activeSlot, composeSlots, effectiveAccountId, accessToken, closeSlot])

  const addAttachmentToSlot = useCallback((slotId: string, node: DriveNode) => {
    if (node.is_folder) return
    setComposeSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId || s.attachments.some((a) => a.nodeId === node.id)) return s
        return { ...s, attachments: [...s.attachments, { nodeId: node.id, name: node.name, size: node.size }] }
      })
    )
    toast.success(`« ${node.name } » ajouté`)
  }, [])

  const removeAttachmentFromSlot = useCallback((slotId: string, nodeId: number) => {
    setComposeSlots((prev) =>
      prev.map((s) => (s.id !== slotId ? s : { ...s, attachments: s.attachments.filter((a) => a.nodeId !== nodeId) }))
    )
  }, [])

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-row items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Mail</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMailSettings(true)}
            className="rounded-lg border border-slate-300 dark:border-slate-500 p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Paramètres de l’application Mail"
            aria-label="Paramètres Mail"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleConnectGoogle}
            disabled={googleConnecting}
            className="rounded-lg border border-slate-300 dark:border-slate-500 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50"
          >
            {googleConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Se connecter avec Google
          </button>
          <button
            type="button"
            onClick={() => setShowConnectEmail(true)}
            className="rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600"
          >
            + Ajouter une boîte
          </button>
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col min-h-[480px]">
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 min-w-0">
          <aside className={`border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/30 flex flex-col min-h-0 min-w-0 overflow-y-auto transition-all duration-200 ${sidebarCollapsed ? 'md:col-span-1 p-2' : 'md:col-span-3 p-3'} gap-2`}>
            <div className={sidebarCollapsed ? 'flex flex-col items-center gap-1' : ''}>
              {!sidebarCollapsed && <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Boîtes mail</p>}
              <div className={`flex flex-col gap-1.5 ${sidebarCollapsed ? 'items-center' : ''}`}>
              {accounts.map((acc) => (
                <div key={acc.id} className={`flex items-center rounded-lg group ${sidebarCollapsed ? 'flex-col w-full' : 'gap-1'}`}>
                  <button
                    type="button"
                    onClick={() => { setSelectedAccountId(acc.id); setActiveFolder('inbox') }}
                    className={`rounded-lg text-sm font-medium truncate transition-colors ${sidebarCollapsed ? 'p-2 w-full flex justify-center' : 'flex-1 min-w-0 text-left px-3 py-2'} ${
                      effectiveAccountId === acc.id
                        ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                    title={acc.email}
                  >
                    {sidebarCollapsed ? <Mail className="h-5 w-5 mx-auto" /> : (acc.label || acc.email)}
                  </button>
                  {!sidebarCollapsed && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditAccountModal(acc.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 shrink-0"
                        title="Modifier la boîte (mot de passe, serveurs IMAP/SMTP)"
                        aria-label="Modifier la boîte mail"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSyncAccountId(acc.id); setSyncPassword(''); setShowSyncModal(true) }}
                        className="p-2 rounded-lg text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-600 shrink-0"
                        title="Synchroniser"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisconnectAccount(acc.id, acc.email)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-600 shrink-0"
                        title="Déconnecter"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              </div>
            </div>
            <div className={`border-t border-slate-200 dark:border-slate-600 pt-2 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
              {!sidebarCollapsed && <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Dossiers</p>}
              {FOLDERS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveFolder(id)}
                  className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2.5'} ${
                    activeFolder === id ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                  title={sidebarCollapsed ? label : undefined}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {!sidebarCollapsed && label}
                </button>
              ))}
              {!sidebarCollapsed && (
                <p className="px-2 mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                  Dossiers de la boîte sélectionnée. Déplacement à venir.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className="mt-auto p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"
              title={sidebarCollapsed ? 'Agrandir le panneau' : 'Réduire le panneau'}
              aria-label={sidebarCollapsed ? 'Agrandir le panneau' : 'Réduire le panneau'}
            >
              {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </aside>
          <div className={`flex flex-col min-h-0 ${sidebarCollapsed ? 'md:col-span-11' : 'md:col-span-9'}`}>
            <div className="border-b border-slate-200 dark:border-slate-600 px-4 py-3 bg-white dark:bg-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {FOLDERS.find((f) => f.id === activeFolder)?.label ?? 'Messages'}
                </span>
                {effectiveAccountId != null && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {accounts.find((a) => a.id === effectiveAccountId)?.email}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleRefreshFromServer}
                disabled={refreshingFromServer}
                className="self-start sm:self-center inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
                title="Récupérer les nouveaux messages depuis le serveur mail (IMAP)"
              >
                {refreshingFromServer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {refreshingFromServer ? 'Actualisation…' : 'Actualiser'}
              </button>
            </div>
            <p className="px-4 py-1.5 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700/50">
              Cliquez sur « Actualiser » pour récupérer les nouveaux messages du serveur.
            </p>
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
              <div className={`flex flex-col min-w-0 flex-1 ${selectedMessageId != null ? 'md:max-w-[50%] border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-600' : ''}`}>
                {messages.length > 0 ? (
                  <>
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/40 dark:bg-slate-900/20 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={handleToggleSelectAllOnPage}
                        disabled={bulkWorking}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                        aria-label="Tout sélectionner (page)"
                      >
                        {allMessagesSelectedOnPage ? <CheckSquare className="h-4 w-4 text-brand-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                        {allMessagesSelectedOnPage ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </button>

                      {selectedMessageIds.length > 0 && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedMessageIds.length} message(s) sélectionné(s)
                        </span>
                      )}
                    </div>

                    {selectedMessageIds.length > 0 && (
                      <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/40 dark:bg-slate-900/20">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleBulkMarkRead(true)}
                            disabled={bulkWorking}
                            aria-label="Marquer comme lu en masse"
                            className="rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50"
                          >
                            Marquer comme lu
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBulkMarkRead(false)}
                            disabled={bulkWorking}
                            aria-label="Marquer comme non lu en masse"
                            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                          >
                            Marquer comme non lu
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBulkMove('trash')}
                            disabled={bulkWorking}
                            aria-label="Corbeille en masse"
                            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            <Trash2 className="h-4 w-4" /> Corbeille
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBulkMove('spam')}
                            disabled={bulkWorking}
                            aria-label="Spam en masse"
                            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            <AlertTriangle className="h-4 w-4 text-red-600" /> Spam
                          </button>
                          {activeFolder !== 'sent' && (
                            <button
                              type="button"
                              onClick={() => handleBulkMove('sent')}
                              disabled={bulkWorking}
                              aria-label="Archiver en masse"
                              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                            >
                              <Send className="h-4 w-4" /> Archiver
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleBulkMove('inbox')}
                            disabled={bulkWorking}
                            aria-label="Boîte de réception en masse"
                            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            <Inbox className="h-4 w-4" /> Boîte de réception
                          </button>

                          <button
                            type="button"
                            onClick={() => clearMessageSelection()}
                            disabled={bulkWorking}
                            aria-label="Effacer la sélection"
                            className="rounded-lg bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                          >
                            Effacer la sélection
                          </button>
                        </div>
                      </div>
                    )}

                    <ul className="divide-y divide-slate-200 dark:divide-slate-600 overflow-auto flex-1">
                      {messages.map((msg) => (
                        <li
                          key={msg.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectMessage(msg)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSelectMessage(msg)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setMessageMenuOpenId(null)
                            setContextMenuMessage({ id: msg.id, x: e.clientX, y: e.clientY })
                          }}
                          className={`relative px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer flex flex-col gap-0.5 group ${selectedMessageId === msg.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                aria-label={`Sélectionner le message ${msg.subject || '(Sans objet)'}`}
                                checked={selectedMessageIds.includes(msg.id)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleMessageSelected(msg.id)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                              />
                              <p className={`truncate ${msg.is_read ? 'font-medium text-slate-900 dark:text-slate-100' : 'font-semibold text-slate-900 dark:text-slate-100'} flex-1`}>
                                {msg.subject || '(Sans objet)'}
                              </p>
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{formatMessageDate(msg.date_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 flex-1">
                              {!msg.is_read ? <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" aria-hidden /> : null}
                              De : {msg.from || '(inconnu)'}
                            </p>
                            <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setMessageMenuOpenId((prev) => (prev === msg.id ? null : msg.id)) }}
                                className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:text-slate-300 dark:hover:bg-slate-600"
                                title="Actions"
                                aria-label="Actions sur le message"
                                aria-expanded={messageMenuOpenId === msg.id}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {messageMenuOpenId === msg.id && (
                                <div className="absolute right-2 mt-1 z-50 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1 min-w-[200px]" role="menu">
                                  {(activeFolder === 'inbox' || activeFolder === 'sent' || activeFolder === 'drafts') && (
                                    <>
                                      <button type="button" role="menuitem" onClick={() => { handleMoveToFolder(msg.id, 'trash'); setMessageMenuOpenId(null) }} disabled={movingMessageId === msg.id} className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                                        <Trash2 className="h-4 w-4 shrink-0" /> Déplacer vers la corbeille
                                      </button>
                                      {activeFolder === 'inbox' && (
                                        <button type="button" role="menuitem" onClick={() => { handleMoveToFolder(msg.id, 'spam'); setMessageMenuOpenId(null) }} disabled={movingMessageId === msg.id} className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                                          <AlertTriangle className="h-4 w-4 shrink-0" /> Signaler comme spam
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {(activeFolder === 'spam' || activeFolder === 'trash') && (
                                    <button type="button" role="menuitem" onClick={() => { handleMoveToFolder(msg.id, 'inbox'); setMessageMenuOpenId(null) }} disabled={movingMessageId === msg.id} className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                                      <Inbox className="h-4 w-4 shrink-0" /> Remettre en boîte de réception
                                    </button>
                                  )}
                                </div>
                              )}
                              {(activeFolder === 'inbox' || activeFolder === 'sent' || activeFolder === 'drafts') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveToFolder(msg.id, 'trash')}
                                    disabled={movingMessageId === msg.id}
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:text-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                                    title="Déplacer vers la corbeille"
                                    aria-label="Corbeille"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                  {activeFolder === 'inbox' && (
                                    <button
                                      type="button"
                                      onClick={() => handleMoveToFolder(msg.id, 'spam')}
                                      disabled={movingMessageId === msg.id}
                                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 disabled:opacity-50"
                                      title="Signaler comme spam"
                                      aria-label="Spam"
                                    >
                                      <AlertTriangle className="h-4 w-4" />
                                    </button>
                                  )}
                                </>
                              )}
                              {(activeFolder === 'spam' || activeFolder === 'trash') && (
                                <button
                                  type="button"
                                  onClick={() => handleMoveToFolder(msg.id, 'inbox')}
                                  disabled={movingMessageId === msg.id}
                                  className="p-1.5 rounded text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-400 dark:hover:bg-brand-900/30 disabled:opacity-50"
                                  title="Remettre en boîte de réception"
                                  aria-label="Boîte de réception"
                                >
                                  <Inbox className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50">
                      <button
                        type="button"
                        onClick={() => setMessagePage((p) => Math.max(0, p - 1))}
                        disabled={messagePage === 0}
                        className="text-sm text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        Précédent
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Page {messagePage + 1} / {totalPages} · {messagesTotal} message(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => setMessagePage((p) => p + 1)}
                        disabled={!hasNextPage}
                        className="text-sm text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        Suivant
                      </button>
                    </div>
                  </>
                ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <Mail className="h-12 w-12 text-slate-300 dark:text-slate-500" />
                  <p className="mt-4 text-slate-600 dark:text-slate-300">Aucun message dans ce dossier</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                    Cliquez sur « Actualiser » ci-dessus pour récupérer les messages depuis le serveur, ou écrivez un message.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button type="button" onClick={handleRefreshFromServer} disabled={refreshingFromServer} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50 inline-flex items-center gap-1">
                      {refreshingFromServer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Actualiser
                    </button>
                    <span className="text-slate-300 dark:text-slate-500">·</span>
                    <button type="button" onClick={() => openNewCompose()} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                      Écrire un message
                    </button>
                  </div>
                </div>
                )}
              </div>
              {selectedMessageId != null && (
                <div className="flex-1 flex flex-col min-w-0 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                  {selectedMessageLoading ? (
                    <div className="flex items-center justify-center flex-1">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    </div>
                  ) : selectedMessageDetail ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600 shrink-0">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate flex-1 pr-2">{selectedMessageDetail.subject || '(Sans objet)'}</h3>
                        <button type="button" onClick={() => setSelectedMessageId(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Fermer">
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shrink-0">
                        <button type="button" onClick={handleReply} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 shadow-sm" title="Répondre">
                          <Reply className="h-4 w-4" />
                          Répondre
                        </button>
                        <button type="button" onClick={handleReplyAll} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700" title="Répondre à tous">
                          <Reply className="h-4 w-4" />
                          Répondre à tous
                        </button>
                        <button type="button" onClick={handleForward} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700" title="Transférer">
                          <Forward className="h-4 w-4" />
                          Transférer
                        </button>
                      </div>
                      <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 space-y-0.5">
                        <p>De : {selectedMessageDetail.from || '(inconnu)'}</p>
                        <p>À : {selectedMessageDetail.to || '—'}</p>
                        <p>{selectedMessageDetail.date_at ? new Date(selectedMessageDetail.date_at).toLocaleString('fr-FR') : ''}</p>
                      </div>
                      <div className="flex-1 overflow-auto px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {selectedMessageDetail.body_plain || selectedMessageDetail.body_html ? (
                          selectedMessageDetail.body_html ? (
                            <div dangerouslySetInnerHTML={{ __html: selectedMessageDetail.body_html }} />
                          ) : (
                            selectedMessageDetail.body_plain
                          )
                        ) : (
                          <p className="text-slate-500 dark:text-slate-400 italic">Corps du message non récupéré. La synchronisation du corps sera disponible dans une prochaine version.</p>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showMailSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Paramètres Mail</h2>
            <div className="space-y-4 mb-4">
              <div>
                <label htmlFor="mail-signature" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Signature (ajoutée en bas de chaque envoi)</label>
                <textarea
                  id="mail-signature"
                  value={mailSignature}
                  onChange={(e) => {
                    const v = e.target.value
                    setMailSignature(v)
                    try {
                      localStorage.setItem(STORAGE_MAIL_SIGNATURE, v)
                    } catch { /* ignore */ }
                  }}
                  placeholder="Ex. : --&#10;Votre nom"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Règles, dossiers personnalisés et notifications en arrière-plan à venir.
              </p>
            </div>
            <button type="button" onClick={() => setShowMailSettings(false)} className="rounded-lg bg-slate-200 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              Fermer
            </button>
          </div>
        </div>
      )}

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

      {composeSlots.map((slot, index) => (
        <div
          key={slot.id}
          className={`fixed right-0 flex flex-col md:left-auto md:right-6 md:max-w-2xl md:w-[600px] left-0 md:left-auto ${slot.minimized ? 'rounded-t-xl md:max-h-[52px] max-h-[48px]' : 'left-4 right-4 md:max-h-[85vh] max-h-[90vh] rounded-t-xl'} shadow-2xl border border-b-0 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800`}
          style={{ bottom: index * 52, zIndex: 50 + index }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`compose-title-${slot.id}`}
        >
          <div
            className={`flex items-center border-b border-slate-200 dark:border-slate-600 shrink-0 ${slot.minimized ? 'px-3 py-1.5' : 'px-4 py-2'} cursor-pointer`}
            onClick={() => slot.minimized && setActiveAndExpand(slot.id)}
          >
            <h2 id={`compose-title-${slot.id}`} className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate flex-1">Nouveau message</h2>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => updateSlot(slot.id, { minimized: !slot.minimized })} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" title={slot.minimized ? 'Agrandir' : 'Réduire en barre'}>
                {slot.minimized ? <Maximize2 className="h-5 w-5" /> : <Minimize2 className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => closeSlot(slot.id)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          {!slot.minimized && (
            <>
              <div className="flex-1 overflow-auto p-4 space-y-4 min-h-0">
                <div>
                  <label htmlFor={`mail-to-${slot.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Destinataire</label>
                  <input
                    id={`mail-to-${slot.id}`}
                    type="email"
                    value={slot.to}
                    onChange={(e) => updateSlot(slot.id, { to: e.target.value })}
                    list="mail-recent-recipients"
                    placeholder="email@exemple.fr"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                <datalist id="mail-recent-recipients">
                  {recipientSuggestions.map((email) => (
                    <option key={email} value={email} />
                  ))}
                  {contacts.map((c) => (
                    <option key={`c-${c.id}`} value={c.email}>{c.name ? `${c.name} <${c.email}>` : c.email}</option>
                  ))}
                </datalist>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Suggestions : contacts récents et carnet Contacts.</p>
              </div>
                <div>
                  <label htmlFor={`mail-subject-${slot.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Objet</label>
                  <input
                    id={`mail-subject-${slot.id}`}
                    type="text"
                    value={slot.subject}
                    onChange={(e) => updateSlot(slot.id, { subject: e.target.value })}
                    placeholder="Objet du message"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor={`mail-body-${slot.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">Message</label>
                    <button
                      type="button"
                      onClick={() => { setDrivePickerForComposeId(slot.id); setDrivePickerParentId(null); setDrivePickerPath([]); setShowDrivePicker(true) }}
                      className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      <Paperclip className="h-4 w-4" />
                      Joindre depuis le Drive
                    </button>
                  </div>
                  {slot.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {slot.attachments.map((a) => (
                        <span
                          key={a.nodeId}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300"
                        >
                          {a.name}
                          <button type="button" onClick={() => removeAttachmentFromSlot(slot.id, a.nodeId)} className="rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 p-0.5">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <textarea
                    id={`mail-body-${slot.id}`}
                    value={slot.body}
                    onChange={(e) => updateSlot(slot.id, { body: e.target.value })}
                    placeholder="Saisissez votre message…"
                    rows={6}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                  />
              {getMailSignature() && (
                <p className="text-xs text-slate-500 dark:text-slate-400">La signature sera ajoutée en bas du message à l’envoi.</p>
              )}
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Fichiers lourds : un lien de téléchargement pourra être généré à la place d’une pièce jointe directe.</p>
              </div>
            </div>
              <div className="flex gap-2 justify-end px-4 py-3 border-t border-slate-200 dark:border-slate-600 shrink-0">
                <button type="button" onClick={() => closeSlot(slot.id)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                  Annuler
                </button>
                <button type="button" onClick={() => handleSendMessage(slot.id)} disabled={sending} className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50">
                  {sending ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
            </>
          )}
          {slot.minimized && (
            <div className="flex items-center gap-3 px-3 py-1.5 border-t border-slate-100 dark:border-slate-700">
              <span className="text-sm text-slate-600 dark:text-slate-400 truncate flex-1 min-w-0">À : {slot.to || '(aucun)'} — {slot.subject || '(sans objet)'}</span>
              <button type="button" onClick={() => setActiveAndExpand(slot.id)} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline shrink-0">Agrandir</button>
              <button type="button" onClick={() => handleSendMessage(slot.id)} disabled={sending} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 disabled:opacity-50 shrink-0">{sending ? 'Envoi…' : 'Envoyer'}</button>
            </div>
          )}
        </div>
      ))}

      {contextMenuMessage && (
        <div
          className="fixed z-[100] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1 min-w-[200px]"
          style={{ left: contextMenuMessage.x, top: contextMenuMessage.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {(activeFolder === 'inbox' || activeFolder === 'sent' || activeFolder === 'drafts') && (
            <>
              <button type="button" role="menuitem" onClick={() => { handleMoveToFolder(contextMenuMessage.id, 'trash'); setContextMenuMessage(null) }} disabled={movingMessageId === contextMenuMessage.id} className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                <Trash2 className="h-4 w-4 shrink-0" /> Déplacer vers la corbeille
              </button>
              {activeFolder === 'inbox' && (
                <button type="button" role="menuitem" onClick={() => { handleMoveToFolder(contextMenuMessage.id, 'spam'); setContextMenuMessage(null) }} disabled={movingMessageId === contextMenuMessage.id} className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Signaler comme spam
                </button>
              )}
            </>
          )}
          {(activeFolder === 'spam' || activeFolder === 'trash') && (
            <button type="button" role="menuitem" onClick={() => { handleMoveToFolder(contextMenuMessage.id, 'inbox'); setContextMenuMessage(null) }} disabled={movingMessageId === contextMenuMessage.id} className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
              <Inbox className="h-4 w-4 shrink-0" /> Remettre en boîte de réception
            </button>
          )}
        </div>
      )}

      {showEditAccountModal && editAccountId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6 my-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Modifier la boîte mail</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Les paramètres IMAP/SMTP (et le mot de passe) sont enregistrés pour la synchronisation et l’envoi. Pensez à relancer « Synchroniser » après modification.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="mail-edit-label" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Libellé</label>
                <input
                  id="mail-edit-label"
                  type="text"
                  value={editAccLabel}
                  onChange={(e) => setEditAccLabel(e.target.value)}
                  placeholder="Ex. : Paul OVH"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label htmlFor="mail-edit-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mot de passe <span className="text-xs text-slate-500 dark:text-slate-400">(optionnel)</span>
                </label>
                <input
                  id="mail-edit-password"
                  type="password"
                  value={editAccPassword}
                  onChange={(e) => setEditAccPassword(e.target.value)}
                  placeholder="Laisser vide pour ne pas changer"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Serveur IMAP</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mail-edit-imap-host" className="sr-only">IMAP host</label>
                    <input
                      id="mail-edit-imap-host"
                      type="text"
                      value={editAccImapHost}
                      onChange={(e) => setEditAccImapHost(e.target.value)}
                      placeholder="(détection automatique)"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="mail-edit-imap-port" className="sr-only">IMAP port</label>
                    <input
                      id="mail-edit-imap-port"
                      type="text"
                      value={editAccImapPort}
                      onChange={(e) => setEditAccImapPort(e.target.value)}
                      placeholder="993"
                      inputMode="numeric"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Serveur SMTP</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mail-edit-smtp-host" className="sr-only">SMTP host</label>
                    <input
                      id="mail-edit-smtp-host"
                      type="text"
                      value={editAccSmtpHost}
                      onChange={(e) => setEditAccSmtpHost(e.target.value)}
                      placeholder="(détection automatique)"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="mail-edit-smtp-port" className="sr-only">SMTP port</label>
                    <input
                      id="mail-edit-smtp-port"
                      type="text"
                      value={editAccSmtpPort}
                      onChange={(e) => setEditAccSmtpPort(e.target.value)}
                      placeholder="587"
                      inputMode="numeric"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetAccountServersAuto}
                disabled={savingAccount}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Serveurs auto (détection)
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowEditAccountModal(false); setEditAccountId(null) }}
                  disabled={savingAccount}
                  className="rounded-lg bg-slate-200 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveAccountSettings}
                  disabled={savingAccount}
                  className="rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50"
                >
                  {savingAccount ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
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
                        onClick={() => { if (drivePickerForComposeId) { addAttachmentToSlot(drivePickerForComposeId, node); setShowDrivePicker(false) } }}
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

      {/* Bouton flottant Nouveau message (style Gmail) */}
      <button
        type="button"
        onClick={() => openNewCompose()}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center gap-2 rounded-full bg-brand-600 dark:bg-brand-500 hover:bg-brand-700 dark:hover:bg-brand-600 text-white shadow-lg hover:shadow-xl w-14 h-14 md:w-16 md:h-16"
        title="Nouveau message"
        aria-label="Nouveau message"
      >
        <PenLine className="h-6 w-6 md:h-7 md:w-7" />
      </button>
    </div>
  )
}
