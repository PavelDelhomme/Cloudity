import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Inbox, Send, FileText, X, PenLine, Paperclip, FolderOpen, Loader2, RefreshCw, Settings, AlertTriangle, ChevronLeft, ChevronRight, Reply, Forward, Minimize2, Maximize2, Trash2, MoreVertical, CheckSquare, Square, MailOpen, ShieldAlert, KeyRound, MessagesSquare, Download, UserPlus, Users, Archive, ArrowUp, ArrowDown, Tag } from 'lucide-react'
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
  downloadMailAttachment,
  markMailMessageRead,
  moveMailMessageToFolder,
  syncMailAccount,
  sendMailMessage,
  getMailGoogleOAuthRedirectUrl,
  fetchContacts,
  fetchMailAliases,
  fetchMailFolderSummary,
  fetchMailImapFolders,
  fetchMailTags,
  createMailTag,
  putMailMessageTags,
  createMailAlias,
  patchMailAlias,
  deleteMailAlias,
  updateMailAccount,
  createContact,
  type DriveNode,
  type MailMessageResponse,
  type MailAccountResponse,
  type MailFolderId,
  type MailStandardFolderId,
  type MailFolderSummaryResponse,
  type ContactResponse,
} from '../../api'

const STORAGE_RECENT_RECIPIENTS = 'cloudity_mail_recent_recipients'
const STORAGE_MAIL_SIGNATURE = 'cloudity_mail_signature'
const STORAGE_SIDEBAR_COLLAPSED = 'cloudity_mail_sidebar_collapsed'
const STORAGE_SIDEBAR_WIDTH_PX = 'cloudity_mail_sidebar_width_px'
const STORAGE_LIST_SPLIT_PCT = 'cloudity_mail_list_split_pct'
const MAIL_SIDEBAR_MIN_PX = 200
const MAIL_SIDEBAR_MAX_PX = 560
const MAIL_LIST_PREVIEW_MIN_PCT = 12
const MAIL_LIST_PREVIEW_MAX_PCT = 88
const STORAGE_DRAFT_PREFIX = 'cloudity_mail_draft_'
const MESSAGES_PAGE_SIZE = 25
/** Aligné sur le backend : pièces jointes au-delà ne sont pas mises en cache en base. */
const MAIL_INLINE_ATTACHMENT_MAX_BYTES = 512 * 1024
/** Sync IMAP en arrière-plan : toutes les boîtes reliées. */
const MAIL_BACKGROUND_SYNC_INTERVAL_MS = 25_000
/** Évite de relancer une sync complète au retour sur l’onglet juste après un tick de fond. */
const MAIL_VISIBILITY_SYNC_MIN_GAP_MS = 22_000

type DraftLocal = { to: string; subject: string; body: string; fromAddress?: string; updatedAt: string }

function notifyNewMailForAccount(
  ctx: ReturnType<typeof useNotifications>,
  account: MailAccountResponse,
  synced: number
): void {
  if (!ctx || synced <= 0) return
  const name = (account.label && account.label.trim()) || account.email
  ctx.addNotification({
    title: 'Nouveau courrier',
    message: synced === 1 ? `${name} — 1 nouveau message` : `${name} — ${synced} nouveaux messages`,
    type: 'info',
  })
  if (typeof globalThis.Notification !== 'undefined' && globalThis.Notification.permission === 'granted') {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      try {
        new globalThis.Notification('Cloudity — Courrier', {
          body: synced === 1 ? `${name} : 1 nouveau message` : `${name} : ${synced} nouveaux messages`,
          tag: `cloudity-mail-${account.id}`,
        })
      } catch {
        /* navigateur peut refuser même avec permission */
      }
    }
  }
}

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

function getListSplitPct(): number {
  try {
    const n = parseFloat(localStorage.getItem(STORAGE_LIST_SPLIT_PCT) || '')
    if (!Number.isFinite(n)) return 42
    return Math.min(MAIL_LIST_PREVIEW_MAX_PCT, Math.max(MAIL_LIST_PREVIEW_MIN_PCT, n))
  } catch {
    return 42
  }
}

function saveListSplitPct(pct: number): void {
  try {
    localStorage.setItem(
      STORAGE_LIST_SPLIT_PCT,
      String(Math.round(Math.min(MAIL_LIST_PREVIEW_MAX_PCT, Math.max(MAIL_LIST_PREVIEW_MIN_PCT, pct))))
    )
  } catch {
    /* ignore */
  }
}

function getSidebarWidthPx(): number {
  try {
    const n = parseInt(localStorage.getItem(STORAGE_SIDEBAR_WIDTH_PX) || '', 10)
    if (!Number.isFinite(n)) return 268
    return Math.min(MAIL_SIDEBAR_MAX_PX, Math.max(MAIL_SIDEBAR_MIN_PX, n))
  } catch {
    return 268
  }
}

function saveSidebarWidthPx(w: number): void {
  try {
    localStorage.setItem(
      STORAGE_SIDEBAR_WIDTH_PX,
      String(Math.round(Math.min(MAIL_SIDEBAR_MAX_PX, Math.max(MAIL_SIDEBAR_MIN_PX, w))))
    )
  } catch {
    /* ignore */
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

function saveDraftLocal(
  accountId: number | null,
  draft: { to: string; subject: string; body: string; fromAddress?: string } | null
): void {
  try {
    const key = getDraftKey(accountId)
    if (!draft || (!draft.to.trim() && !draft.subject.trim() && !draft.body.trim())) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }))
  } catch { /* ignore */ }
}

const FOLDERS: { id: MailStandardFolderId; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Boîte de réception', icon: Inbox },
  { id: 'sent', label: 'Envoyés', icon: Send },
  { id: 'drafts', label: 'Brouillons', icon: FileText },
  { id: 'archive', label: 'Archives', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertTriangle },
  { id: 'trash', label: 'Corbeille', icon: Trash2 },
]

const STANDARD_FOLDER_IDS = new Set<string>(['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'])

function isStandardMailFolderId(f: string): boolean {
  return STANDARD_FOLDER_IDS.has(f)
}

/** Dossiers déjà couverts par la sync standard : ne pas dupliquer dans la liste IMAP. */
const RESERVED_IMAP_PATHS = new Set([
  'INBOX',
  'Sent',
  '[Gmail]/Sent Mail',
  'INBOX.Sent',
  'Drafts',
  '[Gmail]/Drafts',
  'INBOX.Drafts',
  'Archive',
  '[Gmail]/Archive',
  'INBOX.Archive',
  'Archives',
  'Spam',
  'Junk',
  '[Gmail]/Spam',
  'INBOX.Spam',
  'Trash',
  '[Gmail]/Trash',
  'Deleted Messages',
  'Bin',
  'INBOX.Trash',
])

function isReservedImapPathForSidebar(path: string): boolean {
  return RESERVED_IMAP_PATHS.has(path.trim())
}

function folderSidebarBadge(id: MailStandardFolderId, summary: MailFolderSummaryResponse | undefined): string | null {
  const s = summary?.[id]
  if (!s) return null
  if (id === 'inbox' || id === 'spam') return s.unread > 0 ? String(s.unread) : null
  if (id === 'drafts' || id === 'trash') return s.total > 0 ? String(s.total) : null
  if (id === 'sent' || id === 'archive') return s.total > 0 ? String(s.total) : null
  return null
}

function extraFolderSidebarBadge(imapPath: string, summary: MailFolderSummaryResponse | undefined): string | null {
  const row = summary?.extra?.find((e) => e.folder === imapPath)
  if (!row) return null
  const u = row.unread ?? 0
  const t = row.total ?? 0
  if (u > 0) return String(u)
  if (t > 0) return String(t)
  return null
}

function activeFolderTitle(
  activeFolder: string,
  imapLabels: Map<string, string>
): string {
  const std = FOLDERS.find((f) => f.id === activeFolder)
  if (std) return std.label
  return imapLabels.get(activeFolder) ?? activeFolder
}

type AttachmentFromDrive = { nodeId: number; name: string; size: number }

export type ComposeSlot = {
  id: string
  /** Adresse d’affichage « De » (boîte principale ou alias enregistré). */
  fromAddress: string
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

/** Découpe l’en-tête From (« Nom » <email>) pour affichage type client mail. */
function parseFromHeader(from: string | undefined): { displayName: string; email: string | null } {
  if (!from?.trim()) return { displayName: '', email: null }
  const trimmed = from.trim()
  const angle = /<([^>\s]+@[^>\s]+)>/.exec(trimmed)
  if (angle) {
    const emailRaw = angle[1].trim().replace(/^mailto:/i, '')
    let displayName = trimmed.slice(0, angle.index).trim().replace(/,$/, '')
    if ((displayName.startsWith('"') && displayName.endsWith('"')) || (displayName.startsWith("'") && displayName.endsWith("'")))
      displayName = displayName.slice(1, -1)
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : extractEmailFromSender(trimmed)
    return { displayName, email }
  }
  return { displayName: '', email: extractEmailFromSender(trimmed) }
}

/** Libellé liste / détail : nom d’affichage (en-tête ou carnet Contacts), plus email en secondaire si utile. */
function getSenderListLines(from: string | undefined, contacts: ContactResponse[]): { primary: string; secondary: string | null } {
  const { displayName, email } = parseFromHeader(from)
  if (displayName && email) return { primary: displayName, secondary: email }
  if (email) {
    const c = contacts.find((x) => x.email.toLowerCase() === email.toLowerCase())
    if (c?.name?.trim()) return { primary: c.name.trim(), secondary: email }
    return { primary: email, secondary: null }
  }
  return { primary: from?.trim() || '(inconnu)', secondary: null }
}

function formatSenderOneLine(from: string | undefined, contacts: ContactResponse[]): string {
  const { primary, secondary } = getSenderListLines(from, contacts)
  return secondary ? `${primary} · ${secondary}` : primary
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

/** URLs favicon à essayer dans l’ordre : sous-domaines remontés + Google puis DuckDuckGo par domaine. */
function mailFaviconCandidateUrlsFromEmail(senderEmail: string | null): string[] {
  if (!senderEmail) return []
  const at = senderEmail.lastIndexOf('@')
  if (at < 0 || at >= senderEmail.length - 1) return []
  let host = senderEmail.slice(at + 1).trim().toLowerCase()
  if (!host) return []
  const domains: string[] = []
  const seenD = new Set<string>()
  for (let depth = 0; depth < 8 && host.includes('.'); depth++) {
    if (!seenD.has(host)) {
      seenD.add(host)
      domains.push(host)
    }
    const dot = host.indexOf('.')
    if (dot < 0) break
    const rest = host.slice(dot + 1)
    if (rest.split('.').length < 2) break
    host = rest
  }
  const urls: string[] = []
  const seenU = new Set<string>()
  for (const d of domains) {
    const g = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`
    const duck = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico`
    for (const u of [g, duck]) {
      if (!seenU.has(u)) {
        seenU.add(u)
        urls.push(u)
      }
    }
  }
  return urls
}

function senderAvatarInitials(from: string | undefined, contactName?: string | null): string {
  const { displayName } = parseFromHeader(from)
  const base = (contactName?.trim() || displayName.trim() || extractEmailFromSender(from) || '?').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  return base.slice(0, 2).toUpperCase()
}

function formatReceivedDetail(dateAt: string | undefined): string {
  if (!dateAt) return ''
  try {
    return new Date(dateAt).toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateAt
  }
}

function MailRowAvatar({ from, contact }: { from?: string; contact?: ContactResponse | null }) {
  const [faviconFailed, setFaviconFailed] = useState(false)
  const email = extractEmailFromSender(from)
  const fav = email ? mailFaviconUrl(email) : null
  const initials = senderAvatarInitials(from, contact?.name)
  return (
    <div
      className="relative h-9 w-9 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600 dark:from-indigo-600 dark:to-violet-700 flex items-center justify-center text-[11px] font-bold text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      title={contact?.name ? `${contact.name} (${email || ''})` : email || undefined}
    >
      {fav && !faviconFailed ? (
        <img src={fav} alt="" className="h-full w-full object-cover bg-white dark:bg-slate-800" onError={() => setFaviconFailed(true)} />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </div>
  )
}

export default function MailPage() {
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const notifications = useNotifications()
  const queryClient = useQueryClient()
  const [showConnectEmail, setShowConnectEmail] = useState(false)
  const [connectEmailValue, setConnectEmailValue] = useState('')
  const [connectPassword, setConnectPassword] = useState('')
  const [connectLabel, setConnectLabel] = useState('')
  const [connectingAndSyncing, setConnectingAndSyncing] = useState(false)
  const [activeFolder, setActiveFolder] = useState<MailFolderId>('inbox')
  const [filterTagId, setFilterTagId] = useState<number | null>(null)
  /** Filtre liste : même `thread_key` que le serveur (conversation). */
  const [conversationThreadKey, setConversationThreadKey] = useState<string | null>(null)
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
  const [sidebarWidthPx, setSidebarWidthPx] = useState(getSidebarWidthPx)
  const [listSplitPct, setListSplitPct] = useState(getListSplitPct)
  const listPreviewSplitRef = useRef<HTMLDivElement | null>(null)
  const listSplitPctRef = useRef(listSplitPct)
  const sidebarWidthPxRef = useRef(sidebarWidthPx)
  useEffect(() => {
    listSplitPctRef.current = listSplitPct
  }, [listSplitPct])
  useEffect(() => {
    sidebarWidthPxRef.current = sidebarWidthPx
  }, [sidebarWidthPx])
  const [drivePickerForComposeId, setDrivePickerForComposeId] = useState<string | null>(null)
  const [mailSignature, setMailSignature] = useState(getMailSignature())
  const [messageMenuOpenId, setMessageMenuOpenId] = useState<number | null>(null)
  const [contextMenuMessage, setContextMenuMessage] = useState<{ id: number; x: number; y: number; from?: string } | null>(null)
  /** Faux : pas de cases à cocher ; appui long ou menu → sélection (style client mail). */
  const [mailSelectionMode, setMailSelectionMode] = useState(false)
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  })
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
  const [recipientAliasFilter, setRecipientAliasFilter] = useState<string | null>(null)
  const [newAliasEmail, setNewAliasEmail] = useState('')
  const [newAliasLabel, setNewAliasLabel] = useState('')
  /** Cible de livraison documentée (Pass / transfert) — n’active pas le routage sans DNS / fournisseur. */
  const [newAliasDeliverTarget, setNewAliasDeliverTarget] = useState('')
  const [editingAliasCibleId, setEditingAliasCibleId] = useState<number | null>(null)
  const [aliasCibleDraft, setAliasCibleDraft] = useState('')
  const [newMailTagName, setNewMailTagName] = useState('')

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
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const accountIdsFingerprint = useMemo(
    () =>
      accounts
        .map((a) => a.id)
        .sort((a, b) => a - b)
        .join(','),
    [accounts]
  )
  const is404 = accountsError && accountsErrorDetail instanceof Error && accountsErrorDetail.message.includes('404')

  const firstAccountId = accounts[0]?.id ?? null
  const effectiveAccountId = selectedAccountId ?? firstAccountId

  const activeFolderRef = useRef(activeFolder)
  const effectiveAccountIdRef = useRef(effectiveAccountId)
  useEffect(() => {
    activeFolderRef.current = activeFolder
  }, [activeFolder])
  useEffect(() => {
    effectiveAccountIdRef.current = effectiveAccountId
  }, [effectiveAccountId])

  const syncExtraImapOptions = useCallback((accountId: number) => {
    if (effectiveAccountIdRef.current !== accountId) return undefined
    const f = activeFolderRef.current
    if (isStandardMailFolderId(f)) return undefined
    return { extra_imap_folders: [f] }
  }, [])

  const { data: accountAliases = [] } = useQuery({
    queryKey: ['mail', 'aliases', effectiveAccountId],
    queryFn: () => fetchMailAliases(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
  })

  const { data: folderSummary } = useQuery({
    queryKey: ['mail', 'folder-summary', effectiveAccountId],
    queryFn: () => fetchMailFolderSummary(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
    staleTime: 15_000,
  })

  const { data: imapFolders = [] } = useQuery({
    queryKey: ['mail', 'imap-folders', effectiveAccountId],
    queryFn: () => fetchMailImapFolders(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
    staleTime: 60_000,
  })

  const imapLabelByPath = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of imapFolders) {
      const lab = r.label?.trim() || r.imap_path
      m.set(r.imap_path, lab)
    }
    return m
  }, [imapFolders])

  const customImapSidebarRows = useMemo(
    () =>
      [...imapFolders]
        .filter((r) => !isReservedImapPathForSidebar(r.imap_path))
        .sort((a, b) => a.imap_path.localeCompare(b.imap_path)),
    [imapFolders]
  )

  const { data: mailTags = [] } = useQuery({
    queryKey: ['mail', 'tags', effectiveAccountId],
    queryFn: () => fetchMailTags(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
    staleTime: 30_000,
  })

  useEffect(() => {
    setRecipientAliasFilter(null)
  }, [effectiveAccountId])

  useEffect(() => {
    setFilterTagId(null)
    setConversationThreadKey(null)
  }, [effectiveAccountId, activeFolder])

  useEffect(() => {
    setMessagePage(0)
  }, [conversationThreadKey])

  useEffect(() => {
    setMessagePage(0)
  }, [recipientAliasFilter])

  const aliasMutation = useMutation({
    mutationFn: async (
      mode: { type: 'add' } | { type: 'del'; id: number } | { type: 'patch'; id: number; deliver_target_email: string }
    ) => {
      if (!accessToken || effectiveAccountId == null) return
      if (mode.type === 'add') {
        const em = newAliasEmail.trim().toLowerCase()
        if (!em) throw new Error('Adresse alias requise')
        await createMailAlias(accessToken, effectiveAccountId, {
          alias_email: em,
          label: newAliasLabel.trim() || undefined,
          deliver_target_email: newAliasDeliverTarget.trim() || undefined,
        })
        return
      }
      if (mode.type === 'patch') {
        await patchMailAlias(accessToken, effectiveAccountId, mode.id, { deliver_target_email: mode.deliver_target_email })
        return
      }
      await deleteMailAlias(accessToken, effectiveAccountId, mode.id)
    },
    onSuccess: (_, mode) => {
      queryClient.invalidateQueries({ queryKey: ['mail', 'aliases', effectiveAccountId] })
      queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
      if (mode.type === 'add') {
        setNewAliasEmail('')
        setNewAliasLabel('')
        setNewAliasDeliverTarget('')
        toast.success('Alias enregistré')
      } else if (mode.type === 'patch') {
        setEditingAliasCibleId(null)
        setAliasCibleDraft('')
        toast.success('Cible de livraison mise à jour')
      } else toast.success('Alias supprimé')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur alias'),
  })

  const mailTagMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || effectiveAccountId == null) return
      const n = newMailTagName.trim()
      if (!n) throw new Error('Nom d’étiquette requis')
      await createMailTag(accessToken, effectiveAccountId, { name: n })
    },
    onSuccess: () => {
      setNewMailTagName('')
      void queryClient.invalidateQueries({ queryKey: ['mail', 'tags', effectiveAccountId] })
      toast.success('Étiquette créée')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur étiquette'),
  })

  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: ['mail', 'messages', effectiveAccountId, activeFolder, messagePage, recipientAliasFilter, filterTagId, conversationThreadKey],
    queryFn: () =>
      fetchMailMessages(accessToken!, effectiveAccountId!, activeFolder, {
        limit: MESSAGES_PAGE_SIZE,
        offset: messagePage * MESSAGES_PAGE_SIZE,
        ...(recipientAliasFilter
          ? { delivered_to: recipientAliasFilter }
          : {}),
        ...(filterTagId != null && filterTagId > 0 ? { tag_id: filterTagId } : {}),
        ...(conversationThreadKey ? { thread_key: conversationThreadKey } : {}),
      }),
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
  const notificationsRef = useRef(notifications)
  notificationsRef.current = notifications
  const refetchMessagesRef = useRef(refetchMessages)
  refetchMessagesRef.current = refetchMessages

  const {
    data: selectedMessageDetail,
    isPending: selectedMessagePending,
    isFetching: selectedMessageFetching,
    isError: selectedMessageError,
    error: selectedMessageErrorDetail,
    refetch: refetchSelectedMessageDetail,
  } = useQuery({
    queryKey: ['mail', 'message', effectiveAccountId, selectedMessageId],
    queryFn: () => fetchMailMessage(accessToken!, effectiveAccountId!, selectedMessageId!),
    enabled: !!accessToken && effectiveAccountId != null && selectedMessageId != null,
    retry: 8,
    retryDelay: (attempt) => Math.min(12_000, 400 * 2 ** attempt),
  })

  const { data: driveNodes = [], isLoading: driveNodesLoading } = useQuery({
    queryKey: ['drive', 'nodes', drivePickerParentId],
    queryFn: () => fetchDriveNodes(accessToken!, drivePickerParentId),
    enabled: showDrivePicker && !!accessToken,
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => fetchContacts(accessToken!),
    enabled: !!accessToken,
  })

  const recentRecipients = getRecentRecipients()
  const sendersFromMessages = useMemo(
    () => Array.from(new Set(messages.map((m) => m.from).filter((e): e is string => !!e && e.trim() !== ''))),
    [messages]
  )
  const recipientSuggestions = Array.from(new Set([...recentRecipients, ...contacts.map((c) => c.email), ...sendersFromMessages]))

  const composeFromOptions = useMemo(() => {
    const p = accounts.find((a) => a.id === effectiveAccountId)?.email ?? ''
    if (!p) return [] as string[]
    return [p, ...accountAliases.map((a) => a.alias_email)]
  }, [accounts, effectiveAccountId, accountAliases])

  const handleDownloadAttachment = useCallback(
    async (messageId: number, attachmentId: number, filename: string) => {
      if (!accessToken || effectiveAccountId == null) return
      try {
        const blob = await downloadMailAttachment(accessToken, effectiveAccountId, messageId, attachmentId)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || 'piece-jointe'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Téléchargement impossible')
      }
    },
    [accessToken, effectiveAccountId]
  )

  useEffect(() => {
    setSelectedMessageId(null)
    setMessagePage(0)
    setMailSelectionMode(false)
    setSelectedMessageIds([])
  }, [effectiveAccountId, activeFolder])

  useEffect(() => {
    setSelectedMessageIds([])
    setMailSelectionMode(false)
  }, [effectiveAccountId, activeFolder, messagePage])

  /** À l'ouverture de la boîte mail (ou au changement de compte), sync IMAP puis rafraîchir la liste. */
  useEffect(() => {
    if (!accessToken || effectiveAccountId == null) return
    let cancelled = false
    syncMailAccount(accessToken, effectiveAccountId, undefined, syncExtraImapOptions(effectiveAccountId))
      .then((r) => {
        if (cancelled) return
        lastSyncAtRef.current = Date.now()
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
        refetchMessagesRef.current()
        const acc = accountsRef.current.find((a) => a.id === effectiveAccountId)
        if (acc) notifyNewMailForAccount(notificationsRef.current, acc, r.synced)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [effectiveAccountId, accessToken, queryClient, syncExtraImapOptions])

  /**
   * Polling IMAP : le backend synchronise **inbox, sent, drafts, spam, trash** (dont corbeille IMAP Gmail/OVH/etc.).
   * Les messages mis en corbeille uniquement depuis l’app restent en `folder=trash` en base ; la sync fusionne avec le dossier Trash IMAP (UID).
   * invalidateQueries(['mail','messages']) invalide toutes les listes React Query ; refetchMessages() met à jour le dossier ouvert.
   */
  useEffect(() => {
    if (!accessToken || accountIdsFingerprint === '') return
    const tick = async () => {
      const list = accountsRef.current
      for (const acc of list) {
        try {
          const r = await syncMailAccount(accessToken, acc.id, undefined, syncExtraImapOptions(acc.id))
          notifyNewMailForAccount(notificationsRef.current, acc, r.synced)
        } catch {
          /* erreur réseau / IMAP : on continue les autres comptes */
        }
      }
      lastSyncAtRef.current = Date.now()
      await queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
      await queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
      try {
        await refetchMessagesRef.current()
      } catch {
        /* refetch peut échouer si la requête est désactivée */
      }
    }
    const id = window.setInterval(tick, MAIL_BACKGROUND_SYNC_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [accessToken, accountIdsFingerprint, queryClient, syncExtraImapOptions])

  /** Au retour sur l'onglet : sync toutes les boîtes si le dernier sync date un peu. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !accessToken) return
      if (Date.now() - lastSyncAtRef.current < MAIL_VISIBILITY_SYNC_MIN_GAP_MS) return
      const list = accountsRef.current
      if (list.length === 0) return
      void (async () => {
        for (const acc of list) {
          try {
            const r = await syncMailAccount(accessToken, acc.id, undefined, syncExtraImapOptions(acc.id))
            notifyNewMailForAccount(notificationsRef.current, acc, r.synced)
          } catch {
            /* ignorer */
          }
        }
        lastSyncAtRef.current = Date.now()
        await queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        await queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        await queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
        try {
          await refetchMessagesRef.current()
        } catch {
          /* ignorer */
        }
      })()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [accessToken, queryClient, syncExtraImapOptions])

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
    (initial?: { to?: string; subject?: string; body?: string; fromAddress?: string }) => {
      const primary = accounts.find((a) => a.id === effectiveAccountId)?.email ?? ''
      const allowedFrom = new Set(
        [primary.toLowerCase(), ...accountAliases.map((a) => a.alias_email.toLowerCase())].filter(Boolean)
      )
      setComposeSlots((prev) => {
        const wasEmpty = prev.length === 0
        const draft = wasEmpty && effectiveAccountId != null ? loadDraftLocal(effectiveAccountId) : null
        let fromAddress = primary
        if (initial?.fromAddress && allowedFrom.has(initial.fromAddress.toLowerCase())) fromAddress = initial.fromAddress
        else if (draft?.fromAddress && allowedFrom.has(draft.fromAddress.toLowerCase())) fromAddress = draft.fromAddress
        const id = `compose-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const slot: ComposeSlot = {
          id,
          fromAddress,
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
    [effectiveAccountId, accounts, accountAliases]
  )

  const closeSlot = useCallback(
    (id: string) => {
      const slot = composeSlots.find((s) => s.id === id)
      if (slot && effectiveAccountId != null)
        saveDraftLocal(effectiveAccountId, {
          to: slot.to,
          subject: slot.subject,
          body: slot.body,
          fromAddress: slot.fromAddress,
        })
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

  const updateSlot = useCallback(
    (id: string, patch: Partial<Pick<ComposeSlot, 'fromAddress' | 'to' | 'subject' | 'body' | 'minimized'>>) => {
      setComposeSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    },
    []
  )

  const setActiveAndExpand = useCallback((id: string) => {
    setActiveComposeId(id)
    setComposeSlots((prev) => prev.map((s) => ({ ...s, minimized: s.id === id ? false : s.minimized })))
  }, [])

  // Auto-save brouillon du slot actif toutes les 3 s
  useEffect(() => {
    if (!activeSlot || effectiveAccountId == null) return
    const t = setInterval(() => {
      saveDraftLocal(effectiveAccountId, {
        to: activeSlot.to,
        subject: activeSlot.subject,
        body: activeSlot.body,
        fromAddress: activeSlot.fromAddress,
      })
    }, 3000)
    return () => clearInterval(t)
  }, [activeSlot?.id, effectiveAccountId, activeSlot?.to, activeSlot?.subject, activeSlot?.body, activeSlot?.fromAddress])

  /** Si la boîte ou les alias changent, corriger un « De » devenu invalide. */
  useEffect(() => {
    const primary = accounts.find((a) => a.id === effectiveAccountId)?.email ?? ''
    if (!primary) return
    const allowed = new Set([primary.toLowerCase(), ...accountAliases.map((a) => a.alias_email.toLowerCase())])
    setComposeSlots((prev) =>
      prev.map((s) => {
        if (allowed.has(s.fromAddress.toLowerCase())) return s
        return { ...s, fromAddress: primary }
      })
    )
  }, [effectiveAccountId, accounts, accountAliases])

  useEffect(() => {
    const oauth = searchParams.get('oauth')
    const status = searchParams.get('status')
    if (oauth !== 'google') return
    const reason = searchParams.get('reason')
    setSearchParams({}, { replace: true })
    queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] })
    queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
    void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
    if (status === 'ok') {
      toast.success('Compte Gmail connecté. Vous pouvez synchroniser la boîte.')
    } else {
      toast.error(reason === 'config' ? 'Connexion Google non configurée sur ce serveur.' : 'Connexion Google annulée ou erreur.')
    }
  }, [searchParams, setSearchParams, queryClient])

  useEffect(() => {
    const to = searchParams.get('compose')?.trim()
    if (!to) return
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('compose')
        return n
      },
      { replace: true }
    )
    openNewCompose({ to })
  }, [searchParams, setSearchParams, openNewCompose])

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
      void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
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
          void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
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
    syncMailAccount(accessToken, syncAccountId, syncPassword.trim() || undefined, syncExtraImapOptions(syncAccountId))
      .then((r) => {
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
        toast.success(r.synced > 0 ? `${r.synced} message(s) synchronisé(s)` : r.message)
        setShowSyncModal(false)
        setSyncAccountId(null)
        setSyncPassword('')
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur de synchronisation'))
      .finally(() => setSyncing(false))
  }, [syncAccountId, syncPassword, accessToken, queryClient, syncExtraImapOptions])

  /** Récupère les nouveaux messages depuis le serveur IMAP puis rafraîchit la liste (sans ouvrir la modale). */
  const handleRefreshFromServer = useCallback(() => {
    if (!effectiveAccountId || !accessToken) return
    setRefreshingFromServer(true)
    syncMailAccount(accessToken, effectiveAccountId, undefined, syncExtraImapOptions(effectiveAccountId))
      .then((r) => {
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
        refetchMessages()
        toast.success(r.synced > 0 ? `${r.synced} nouveau(x) message(s) récupéré(s)` : r.message || 'Liste à jour')
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur lors de l’actualisation'))
      .finally(() => setRefreshingFromServer(false))
  }, [effectiveAccountId, accessToken, queryClient, refetchMessages, syncExtraImapOptions])

  const [movingMessageId, setMovingMessageId] = useState<number | null>(null)
  const handleMoveToFolder = useCallback(
    async (messageId: number, folder: MailFolderId) => {
      if (!effectiveAccountId || !accessToken) return
      setMovingMessageId(messageId)
      try {
        await moveMailMessageToFolder(accessToken, effectiveAccountId, messageId, folder)
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
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

  const clearMessageSelection = useCallback(() => {
    setSelectedMessageIds([])
    setMailSelectionMode(false)
  }, [])

  const contactsByEmail = useMemo(() => {
    const m = new Map<string, ContactResponse>()
    for (const c of contacts) {
      m.set(c.email.trim().toLowerCase(), c)
    }
    return m
  }, [contacts])

  const handleOpenContactFromMail = useCallback(
    (fromHeader: string | undefined) => {
      const email = extractEmailFromSender(fromHeader)
      if (!email) {
        toast.error('Adresse introuvable dans l’en-tête')
        return
      }
      navigate(`/app/contacts?q=${encodeURIComponent(email)}`)
    },
    [navigate]
  )

  const handleQuickAddContactFromMail = useCallback(
    async (fromHeader: string | undefined) => {
      const email = extractEmailFromSender(fromHeader)
      if (!email || !accessToken) {
        toast.error('Adresse e-mail introuvable')
        return
      }
      const key = email.toLowerCase()
      if (contactsByEmail.has(key)) {
        toast.success('Déjà dans vos contacts')
        navigate(`/app/contacts?q=${encodeURIComponent(email)}`)
        return
      }
      const { displayName } = parseFromHeader(fromHeader)
      try {
        await createContact(accessToken, { email, name: displayName || undefined })
        await queryClient.invalidateQueries({ queryKey: ['contacts'] })
        toast.success('Contact ajouté')
        navigate(`/app/contacts?q=${encodeURIComponent(email)}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Impossible d’ajouter le contact')
      }
    },
    [accessToken, contactsByEmail, navigate, queryClient]
  )

  const handleToggleSelectAllOnPage = useCallback(() => {
    if (allMessagesSelectedOnPage) clearMessageSelection()
    else selectAllMessagesOnPage()
  }, [allMessagesSelectedOnPage, clearMessageSelection, selectAllMessagesOnPage])

  const handleInvertSelectionOnPage = useCallback(() => {
    if (messages.length === 0) return
    const pageIds = messages.map((m) => m.id)
    setSelectedMessageIds((prev) => {
      const prevSet = new Set(prev)
      return pageIds.filter((id) => !prevSet.has(id))
    })
  }, [messages])

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
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
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
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
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

  const clearMessageLongPressTimer = useCallback(() => {
    const t = longPressRef.current.timer
    if (t != null) window.clearTimeout(t)
    longPressRef.current.timer = null
  }, [])

  const onMessageListPointerDown = useCallback(
    (msg: MailMessageResponse, e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      clearMessageLongPressTimer()
      longPressRef.current.fired = false
      longPressRef.current.timer = window.setTimeout(() => {
        longPressRef.current.timer = null
        longPressRef.current.fired = true
        setMailSelectionMode(true)
        setSelectedMessageIds((prev) => (prev.includes(msg.id) ? prev : [...prev, msg.id]))
      }, 550)
    },
    [clearMessageLongPressTimer]
  )

  const onMessageListPointerEnd = useCallback(() => {
    clearMessageLongPressTimer()
  }, [clearMessageLongPressTimer])

  const handleSelectMessage = useCallback(
    (msg: MailMessageResponse) => {
      if (longPressRef.current.fired) {
        longPressRef.current.fired = false
        return
      }
      if (mailSelectionMode) {
        toggleMessageSelected(msg.id)
        return
      }
      setSelectedMessageId(msg.id)
      const senderEmail = extractEmailFromSender(msg.from)
      if (senderEmail) addRecentRecipient(senderEmail)
      if (!msg.is_read && accessToken && effectiveAccountId) {
        markMailMessageRead(accessToken, effectiveAccountId, msg.id, true)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
            void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
          })
          .catch(() => {})
      }
    },
    [accessToken, effectiveAccountId, mailSelectionMode, queryClient, toggleMessageSelected]
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

  const handleListPreviewResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return
    e.preventDefault()
    const el = e.currentTarget
    const container = listPreviewSplitRef.current
    if (!container) return
    el.setPointerCapture(e.pointerId)
    const rect = container.getBoundingClientRect()
    const startX = e.clientX
    const startPct = listSplitPctRef.current
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const dx = ev.clientX - startX
      const deltaPct = rect.width > 0 ? (dx / rect.width) * 100 : 0
      const next = Math.min(MAIL_LIST_PREVIEW_MAX_PCT, Math.max(MAIL_LIST_PREVIEW_MIN_PCT, startPct + deltaPct))
      setListSplitPct(next)
      listSplitPctRef.current = next
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      el.releasePointerCapture(e.pointerId)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      saveListSplitPct(listSplitPctRef.current)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }, [])

  const handleSidebarResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return
    if (e.button !== 0 && e.pointerType !== 'touch') return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = sidebarWidthPxRef.current
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const dx = ev.clientX - startX
      const next = Math.min(MAIL_SIDEBAR_MAX_PX, Math.max(MAIL_SIDEBAR_MIN_PX, startW + dx))
      setSidebarWidthPx(next)
      sidebarWidthPxRef.current = next
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      el.releasePointerCapture(e.pointerId)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      saveSidebarWidthPx(sidebarWidthPxRef.current)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }, [sidebarCollapsed])

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
    const meLower = me?.toLowerCase()
    const isSelf = (addr: string) => {
      const em = extractEmailFromSender(addr)
      return (em || addr.trim()).toLowerCase() === meLower
    }
    const others = [from, ...toAddrs].filter((a) => a && !isSelf(a))
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
          from_email: slot.fromAddress.trim() || undefined,
        })
        toast.success('Message envoyé')
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        closeSlot(slot.id)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur d’envoi')
      } finally {
        setSending(false)
      }
    },
    [activeSlot, composeSlots, effectiveAccountId, accessToken, closeSlot, queryClient]
  )

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
    <div className="flex flex-col gap-4 min-h-0 pb-6">
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col min-h-[260px] max-h-[calc(100dvh-10.5rem)]">
        <div className="flex flex-col md:flex-row flex-1 min-h-0 min-w-0">
          <aside
            className={`border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/30 flex flex-col min-h-0 max-h-full overflow-y-auto overscroll-contain transition-[width] duration-150 ease-out gap-2 shrink-0 ${
              sidebarCollapsed ? 'md:w-14 md:min-w-14 md:max-w-14 p-2' : 'p-3'
            }`}
            style={
              sidebarCollapsed
                ? undefined
                : {
                    width: sidebarWidthPx,
                    minWidth: MAIL_SIDEBAR_MIN_PX,
                    maxWidth: MAIL_SIDEBAR_MAX_PX,
                  }
            }
          >
            <div className={sidebarCollapsed ? 'flex flex-col items-center gap-1' : ''}>
              {!sidebarCollapsed && <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Boîtes mail</p>}
              <div className={`flex flex-col gap-1.5 ${sidebarCollapsed ? 'items-center' : ''}`}>
              {accounts.map((acc) => (
                <div key={acc.id} className={`flex flex-col rounded-lg ${sidebarCollapsed ? 'w-full' : ''}`}>
                  <button
                    type="button"
                    onClick={() => { setSelectedAccountId(acc.id); setActiveFolder('inbox'); setRecipientAliasFilter(null) }}
                    className={`rounded-lg text-sm font-medium truncate transition-colors w-full ${sidebarCollapsed ? 'p-2 flex justify-center' : 'text-left px-3 py-2'} ${
                      effectiveAccountId === acc.id
                        ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                    title={acc.label ? `${acc.label} — ${acc.email}` : acc.email}
                  >
                    {sidebarCollapsed ? (
                      <Mail className="h-5 w-5 mx-auto" />
                    ) : (
                      <span className="flex flex-col items-start min-w-0 w-full gap-0.5">
                        <span className="truncate w-full">{acc.label || acc.email}</span>
                        {acc.label ? (
                          <span className="truncate w-full text-[10px] font-normal text-slate-500 dark:text-slate-400">
                            {acc.email}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </button>
                  {!sidebarCollapsed && effectiveAccountId === acc.id && (
                    <div className="mt-1 ml-1 pl-2 border-l-2 border-slate-200 dark:border-slate-600 space-y-0.5 pb-1">
                      <button
                        type="button"
                        onClick={() => setRecipientAliasFilter(null)}
                        title="Tous les messages du dossier : adresse principale de la boîte et tous les alias enregistrés (reçus en To)."
                        className={`block w-full text-left text-[11px] px-1.5 py-1 rounded ${recipientAliasFilter == null ? 'bg-slate-200/80 dark:bg-slate-600 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                      >
                        Toutes les adresses
                      </button>
                      {accountAliases.map((al) => (
                        <button
                          key={al.id}
                          type="button"
                          onClick={() => setRecipientAliasFilter(al.alias_email)}
                          className={`block w-full text-left text-[11px] px-1.5 py-1 rounded truncate ${recipientAliasFilter === al.alias_email ? 'bg-brand-100/80 dark:bg-brand-900/50 text-brand-900 dark:text-brand-100' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                          title={`Messages dont le champ À contient ${al.alias_email}`}
                        >
                          {al.label?.trim() ? `${al.label} · ${al.alias_email}` : al.alias_email}
                        </button>
                      ))}
                      {accountAliases.length === 0 ? (
                        <p className="text-[10px] text-slate-400 px-1.5">Alias : Paramètres Mail</p>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
            <div className={`border-t border-slate-200 dark:border-slate-600 pt-2 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
              {!sidebarCollapsed && <p className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Dossiers</p>}
              {FOLDERS.map(({ id, label, icon: Icon }) => {
                const badge = folderSidebarBadge(id, folderSummary)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveFolder(id)}
                    className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2.5'} ${
                      activeFolder === id ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                    title={
                      sidebarCollapsed
                        ? `${label}${badge ? ` (${badge})` : ''} — réception/spam : non lus ; brouillons/corbeille : total`
                        : undefined
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span className="flex-1 text-left truncate">{label}</span>}
                    {!sidebarCollapsed && badge ? (
                      <span className="tabular-nums text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/90 dark:bg-slate-600/80 px-1.5 py-0.5 rounded-md min-w-[1.35rem] text-center shrink-0">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {!sidebarCollapsed && customImapSidebarRows.length > 0 ? (
                <p className="px-2 mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Autres dossiers (IMAP)
                </p>
              ) : null}
              {customImapSidebarRows.map((row) => {
                const badge = extraFolderSidebarBadge(row.imap_path, folderSummary)
                const depth = row.parent_imap_path ? 1 : 0
                return (
                  <button
                    key={row.imap_path}
                    type="button"
                    onClick={() => setActiveFolder(row.imap_path)}
                    className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'} ${
                      activeFolder === row.imap_path
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                    title={sidebarCollapsed ? row.imap_path : undefined}
                  >
                    <FolderOpen className="h-4 w-4 flex-shrink-0 opacity-80" />
                    {!sidebarCollapsed && (
                      <span
                        className="flex-1 text-left truncate text-[13px]"
                        style={{ paddingLeft: depth ? 10 : 0 }}
                      >
                        {row.label?.trim() || row.imap_path}
                      </span>
                    )}
                    {!sidebarCollapsed && badge ? (
                      <span className="tabular-nums text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/90 dark:bg-slate-600/80 px-1.5 py-0.5 rounded-md min-w-[1.35rem] text-center shrink-0">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {!sidebarCollapsed && (
                <p className="px-2 mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                  Libellé, synchro avancée et retrait d’une boîte : icône Paramètres en haut.
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
          {!sidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionner le panneau des boîtes et dossiers"
              className="hidden md:flex w-3 shrink-0 touch-none cursor-col-resize select-none items-stretch justify-center hover:bg-brand-500/15 dark:hover:bg-brand-400/20 active:bg-brand-500/25 border-x border-transparent"
              onPointerDown={handleSidebarResizePointerDown}
              title="Glisser pour élargir ou réduire la colonne des dossiers"
            >
              <span className="w-px self-stretch bg-slate-300 dark:bg-slate-600" aria-hidden />
            </div>
          )}
          <div className="flex flex-col min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-600 px-4 py-3 bg-white dark:bg-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {activeFolderTitle(activeFolder, imapLabelByPath)}
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
              {filterTagId != null ? ' — filtre par étiquette actif (dossier courant).' : ''}
              {conversationThreadKey ? ' — seuls les messages de cette conversation sont listés.' : ''}
            </p>
            {conversationThreadKey ? (
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-2 bg-amber-50/50 dark:bg-amber-900/10">
                <span className="text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-2">
                  <MessagesSquare className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                  Filtre conversation actif
                </span>
                <button
                  type="button"
                  onClick={() => setConversationThreadKey(null)}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Afficher tout le dossier
                </button>
              </div>
            ) : null}
            {effectiveAccountId != null && (
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Étiquettes</span>
                <button
                  type="button"
                  onClick={() => setFilterTagId(null)}
                  className={`text-xs rounded-full px-2.5 py-1 font-medium ${
                    filterTagId == null
                      ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-100'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Toutes
                </button>
                {mailTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilterTagId(filterTagId === t.id ? null : t.id)}
                    className={`text-xs rounded-full px-2.5 py-1 font-medium ${
                      filterTagId === t.id
                        ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-100'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                <span className="hidden sm:inline w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" aria-hidden />
                <input
                  type="text"
                  value={newMailTagName}
                  onChange={(e) => setNewMailTagName(e.target.value)}
                  placeholder="Nouvelle étiquette"
                  className="text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 min-w-[7rem] max-w-[11rem]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      mailTagMutation.mutate()
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={mailTagMutation.isPending || !newMailTagName.trim()}
                  onClick={() => mailTagMutation.mutate()}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40"
                >
                  Créer
                </button>
              </div>
            )}
            <div ref={listPreviewSplitRef} className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
              <div
                className={`flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden border-b border-slate-200 dark:border-slate-600 md:border-b-0 ${
                  selectedMessageId != null
                    ? 'md:w-[var(--mail-list-split-pct)] md:max-w-[92%] md:min-w-[8rem] md:shrink-0 md:flex-none md:border-r'
                    : ''
                }`}
                style={
                  selectedMessageId != null
                    ? ({ ['--mail-list-split-pct' as string]: `${listSplitPct}%` } as React.CSSProperties)
                    : undefined
                }
              >
                {messages.length > 0 ? (
                  <>
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/40 dark:bg-slate-900/20 flex flex-wrap items-center justify-between gap-3">
                      {!mailSelectionMode && selectedMessageIds.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => setMailSelectionMode(true)}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-600"
                          aria-label="Sélectionner des messages"
                        >
                          <CheckSquare className="h-4 w-4 text-slate-500" aria-hidden />
                          Sélectionner des messages
                        </button>
                      ) : (
                        <>
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
                            <button
                              type="button"
                              onClick={handleInvertSelectionOnPage}
                              disabled={bulkWorking}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                              aria-label="Inverser la sélection (page)"
                            >
                              Inverser la sélection
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => clearMessageSelection()}
                            className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                          >
                            Terminer
                          </button>

                          {selectedMessageIds.length > 0 ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {selectedMessageIds.length} message(s) sélectionné(s)
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Appui long sur un message pour en ajouter à la sélection</span>
                          )}
                        </>
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

                    <ul className="divide-y divide-slate-200 dark:divide-slate-600 min-h-0 overflow-y-auto flex-1 overscroll-contain">
                      {messages.map((msg) => {
                        const senderKey = extractEmailFromSender(msg.from)?.toLowerCase()
                        const rowContact = senderKey ? contactsByEmail.get(senderKey) ?? null : null
                        return (
                        <li
                          key={msg.id}
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => onMessageListPointerDown(msg, e)}
                          onPointerUp={onMessageListPointerEnd}
                          onPointerCancel={onMessageListPointerEnd}
                          onPointerLeave={(e) => {
                            if (e.pointerType === 'mouse') onMessageListPointerEnd()
                          }}
                          onClick={() => handleSelectMessage(msg)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSelectMessage(msg)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setMessageMenuOpenId(null)
                            setContextMenuMessage({ id: msg.id, x: e.clientX, y: e.clientY, from: msg.from })
                          }}
                          className={`relative px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer flex flex-col gap-0.5 group ${selectedMessageId === msg.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <div
                              className="shrink-0 pt-0.5"
                              onPointerDown={(e) => {
                                if (mailSelectionMode) e.stopPropagation()
                              }}
                            >
                              {mailSelectionMode ? (
                                <input
                                  type="checkbox"
                                  aria-label={`Sélectionner le message ${msg.subject || '(Sans objet)'}`}
                                  checked={selectedMessageIds.includes(msg.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={() => toggleMessageSelected(msg.id)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                                />
                              ) : (
                                <MailRowAvatar from={msg.from} contact={rowContact} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <p className={`truncate flex-1 flex items-center gap-1.5 min-w-0 ${msg.is_read ? 'font-medium text-slate-900 dark:text-slate-100' : 'font-semibold text-slate-900 dark:text-slate-100'}`}>
                                  {activeFolder === 'inbox' && (msg.spam_score ?? 0) >= 52 ? (
                                    <span title={`Indésirable probable (score ${msg.spam_score ?? 0}/100) — vérifiez avant d’ouvrir les pièces jointes.`} className="shrink-0 text-amber-600 dark:text-amber-400">
                                      <ShieldAlert className="h-4 w-4" aria-hidden />
                                    </span>
                                  ) : null}
                                  <span className="truncate">{msg.subject || '(Sans objet)'}</span>
                                </p>
                                <span className="flex items-center gap-2 shrink-0">
                                  {(msg.attachment_count ?? 0) > 0 ? (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400"
                                      title={`${msg.attachment_count} pièce(s) jointe(s)`}
                                    >
                                      <Paperclip className="h-3.5 w-3.5" aria-hidden />
                                      {msg.attachment_count}
                                    </span>
                                  ) : null}
                                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatMessageDate(msg.date_at ?? msg.created_at)}</span>
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1" title={msg.from || undefined}>
                                    {!msg.is_read ? <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" aria-hidden /> : null}
                                    <span className="truncate min-w-0">De : {formatSenderOneLine(msg.from, contacts)}</span>
                                  </p>
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                    Reçu : {formatReceivedDetail(msg.date_at ?? msg.created_at)}
                                  </p>
                                </div>
                            <div className="flex items-center gap-0.5 shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setMailSelectionMode(true)
                                      setSelectedMessageIds((prev) => (prev.includes(msg.id) ? prev : [...prev, msg.id]))
                                      setMessageMenuOpenId(null)
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                                  >
                                    <CheckSquare className="h-4 w-4 shrink-0" /> Sélectionner
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      handleOpenContactFromMail(msg.from)
                                      setMessageMenuOpenId(null)
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                                  >
                                    <Users className="h-4 w-4 shrink-0" /> Ouvrir dans Contacts
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      void handleQuickAddContactFromMail(msg.from)
                                      setMessageMenuOpenId(null)
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                                  >
                                    <UserPlus className="h-4 w-4 shrink-0" /> Ajouter aux contacts
                                  </button>
                                  {msg.thread_key ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setConversationThreadKey(msg.thread_key!)
                                        setMessageMenuOpenId(null)
                                        setMessagePage(0)
                                      }}
                                      className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                      <MessagesSquare className="h-4 w-4 shrink-0" /> Voir le fil de conversation
                                    </button>
                                  ) : null}
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
                            </div>
                          </div>
                        </li>
                        )
                      })}
                    </ul>
                    <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50">
                      <button
                        type="button"
                        onClick={() => setMessagePage((p) => Math.max(0, p - 1))}
                        disabled={messagePage === 0}
                        className="text-sm text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        Précédent
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400 text-center sm:px-2">
                        Page {messagePage + 1} / {totalPages} · {messagesTotal} message(s) · {MESSAGES_PAGE_SIZE} par page
                      </span>
                      <button
                        type="button"
                        onClick={() => setMessagePage((p) => p + 1)}
                        disabled={!hasNextPage}
                        className="text-sm text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:no-underline sm:text-right"
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
                <>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-valuenow={Math.round(listSplitPct)}
                    aria-valuemin={MAIL_LIST_PREVIEW_MIN_PCT}
                    aria-valuemax={MAIL_LIST_PREVIEW_MAX_PCT}
                    aria-label="Redimensionner la liste des messages et l’aperçu"
                    className="hidden md:flex w-3 shrink-0 touch-none cursor-col-resize select-none items-stretch justify-center hover:bg-brand-500/15 dark:hover:bg-brand-400/20 active:bg-brand-500/25 border-x border-transparent"
                    onPointerDown={handleListPreviewResizePointerDown}
                    title="Glisser pour redimensionner la liste et l’aperçu (souris ou doigt)"
                  >
                    <span className="w-px self-stretch bg-slate-300 dark:bg-slate-600" aria-hidden />
                  </div>
                  <div className="flex-1 flex flex-col min-w-0 border-t md:border-t-0 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                  {selectedMessageError && !selectedMessageDetail ? (
                    <div className="flex flex-col flex-1 min-h-0 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">Impossible d’ouvrir le message</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            Le serveur n’a pas pu charger le corps du message (souvent temporaire). Des réessais automatiques ont lieu — ou clique sur « Réessayer ».
                          </p>
                        </div>
                        <button type="button" onClick={() => setSelectedMessageId(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0" aria-label="Fermer">
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-auto min-h-0">
                        <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-words">
                          {selectedMessageErrorDetail instanceof Error ? selectedMessageErrorDetail.message : String(selectedMessageErrorDetail)}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void refetchSelectedMessageDetail()}
                          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Réessayer
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedMessageId(null)}
                          className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          Fermer
                        </button>
                      </div>
                    </div>
                  ) : !selectedMessageDetail && (selectedMessagePending || selectedMessageFetching) ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {selectedMessageFetching && !selectedMessagePending ? 'Nouvelle tentative de chargement…' : 'Chargement du message…'}
                      </p>
                    </div>
                  ) : selectedMessageDetail ? (
                    <>
                      <div className="shrink-0 border-b border-slate-200 dark:border-slate-600 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/90 dark:to-slate-800">
                        <div className="flex items-start justify-between gap-3 px-4 py-3 md:px-5">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                              {selectedMessageDetail.subject || '(Sans objet)'}
                            </h3>
                            <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                              {(() => {
                                const sl = getSenderListLines(selectedMessageDetail.from, contacts)
                                return (
                                  <p title={selectedMessageDetail.from || undefined}>
                                    <span className="text-slate-400 dark:text-slate-500 font-medium">De</span>{' '}
                                    <span className="text-slate-800 dark:text-slate-100 inline-flex flex-col gap-0.5 align-top">
                                      <span className="font-medium">{sl.primary}</span>
                                      {sl.secondary ? (
                                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{sl.secondary}</span>
                                      ) : null}
                                    </span>
                                  </p>
                                )
                              })()}
                              <p>
                                <span className="text-slate-400 dark:text-slate-500 font-medium">À</span>{' '}
                                <span>{selectedMessageDetail.to || '—'}</span>
                              </p>
                              {selectedMessageDetail.date_at ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                  <MailOpen className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                                  {new Date(selectedMessageDetail.date_at).toLocaleString('fr-FR', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedMessageId(null)}
                            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 border border-transparent hover:border-slate-300 dark:hover:border-slate-600"
                            aria-label="Fermer l’aperçu"
                          >
                            Fermer
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:px-5">
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
                          {selectedMessageDetail.thread_key ? (
                            <button
                              type="button"
                              onClick={() => {
                                setConversationThreadKey(selectedMessageDetail.thread_key!)
                                setMessagePage(0)
                              }}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                              title="Limiter la liste aux messages de cette conversation"
                            >
                              <MessagesSquare className="h-4 w-4" />
                              Fil de conversation
                            </button>
                          ) : null}
                        </div>
                        {(selectedMessageDetail.attachments?.length ?? 0) > 0 ? (
                          <div className="px-4 pb-3 md:px-5 border-b border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/50">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <Paperclip className="h-3.5 w-3.5" aria-hidden />
                              Pièces jointes
                            </p>
                            <ul className="flex flex-col gap-1.5">
                              {selectedMessageDetail.attachments!.map((att) => (
                                <li key={att.id}>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadAttachment(selectedMessageDetail.id, att.id, att.filename)}
                                    className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-brand-300 dark:hover:border-brand-600 hover:bg-brand-50/50 dark:hover:bg-brand-900/20"
                                  >
                                    <Download className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                    <span className="flex-1 min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">{att.filename}</span>
                                    <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                                      {att.size_bytes > MAIL_INLINE_ATTACHMENT_MAX_BYTES
                                        ? '≥ 512 Ko'
                                        : `${Math.max(1, Math.round(att.size_bytes / 1024))} Ko`}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex-1 overflow-auto min-h-0 bg-slate-100/60 dark:bg-slate-900/40">
                        <div className="mx-auto max-w-3xl px-3 py-4 md:px-6 md:py-6">
                          <article className="rounded-xl border border-slate-200/90 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                            {selectedMessageDetail.body_plain || selectedMessageDetail.body_html ? (
                              selectedMessageDetail.body_html ? (
                                <div
                                  className="mail-html-body px-5 py-6 md:px-8 md:py-8"
                                  dangerouslySetInnerHTML={{ __html: selectedMessageDetail.body_html }}
                                />
                              ) : (
                                <div className="px-5 py-6 md:px-8 md:py-8 text-[0.9375rem] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                                  {selectedMessageDetail.body_plain}
                                </div>
                              )
                            ) : (
                              <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400 italic">
                                Corps du message vide pour l’instant. Utilisez « Actualiser » en haut de la liste ou rouvrez le message après synchronisation.
                              </div>
                            )}
                          </article>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showMailSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-lg max-h-[min(90vh,720px)] flex flex-col">
            <div className="px-5 pt-5 pb-3 border-b border-slate-200 dark:border-slate-600 shrink-0">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Paramètres Mail</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Signature, boîtes reliées (renommer, synchro, retirer).</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              <div>
                <label htmlFor="mail-signature" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Signature (ajoutée en bas de chaque envoi)
                </label>
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
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 text-sm"
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Mes boîtes mail</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Renommer, modifier les serveurs / mot de passe, forcer une synchro ou retirer une adresse (action définitive).
                </p>
                {accounts.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Aucune boîte reliée.</p>
                ) : (
                  <ul className="space-y-3">
                    {accounts.map((acc) => (
                      <li
                        key={acc.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-3"
                      >
                        <div className="mb-2 min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{acc.label?.trim() || acc.email}</p>
                          {acc.label?.trim() ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{acc.email}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowMailSettings(false)
                              openEditAccountModal(acc.id)
                            }}
                            className="rounded-lg border border-slate-300 dark:border-slate-500 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                          >
                            Libellé &amp; serveurs…
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowMailSettings(false)
                              setSyncAccountId(acc.id)
                              setSyncPassword('')
                              setShowSyncModal(true)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-500 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Synchroniser…
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Retirer la boîte « ${acc.email} » de Cloudity ?\n\nLes messages déjà synchronisés ne seront plus accessibles ici. Cette action est définitive.`
                                )
                              ) {
                                handleDisconnectAccount(acc.id, acc.email)
                                setShowMailSettings(false)
                              }
                            }}
                            className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50"
                          >
                            Retirer la boîte
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-3 space-y-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> Sécurité & Coffre-fort
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Les mots de passe IMAP/SMTP sont chiffrés en base (clé <code className="text-[10px]">MAIL_PASSWORD_ENCRYPTION_KEY</code>). Centralisez les secrets liés au mail dans le coffre Pass.
                </p>
                <Link
                  to="/app/pass"
                  onClick={() => setShowMailSettings(false)}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white text-xs font-medium px-3 py-2 hover:bg-brand-700 dark:hover:bg-brand-600"
                >
                  Ouvrir Coffre (Pass)
                </Link>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <strong>Anti-spam :</strong> score heuristique (0–100) sur chaque message en boîte de réception ; pastille orange si suspect. Chiffrement « de bout en bout » des corps stockés et détection ML : voir roadmap projet.
                </p>
              </div>

              {effectiveAccountId != null && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Alias (adresses supplémentaires)</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Déclarez les adresses qui <strong>reçoivent</strong> dans cette boîte (fournisseur / DNS déjà configurés). Dans la barre latérale, « Toutes les adresses » affiche tout le dossier ; un alias ne montre que les messages dont le champ <strong>À</strong> contient cette adresse.
                    La <strong>cible de livraison</strong> est une note pour vous (et plus tard Pass) : vers quelle boîte réelle le mail doit arriver — Cloudity ne configure pas seul le DNS MX.
                  </p>
                  <ul className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                    {accountAliases.map((al) => (
                      <li
                        key={al.id}
                        className="flex flex-col gap-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{al.alias_email}</span>
                          <button
                            type="button"
                            className="text-red-600 dark:text-red-400 shrink-0"
                            onClick={() => aliasMutation.mutate({ type: 'del', id: al.id })}
                            disabled={aliasMutation.isPending}
                          >
                            Retirer
                          </button>
                        </div>
                        {al.deliver_target_email ? (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate" title={al.deliver_target_email}>
                            → {al.deliver_target_email}
                          </p>
                        ) : null}
                        {editingAliasCibleId === al.id ? (
                          <div className="flex flex-wrap gap-1 items-center">
                            <input
                              type="text"
                              value={aliasCibleDraft}
                              onChange={(e) => setAliasCibleDraft(e.target.value)}
                              placeholder="ex. ma-boite-reelle@domaine.com"
                              className="flex-1 min-w-[140px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-0.5 text-[11px]"
                            />
                            <button
                              type="button"
                              className="text-[11px] text-brand-600 dark:text-brand-400 font-medium"
                              disabled={aliasMutation.isPending}
                              onClick={() =>
                                aliasMutation.mutate({ type: 'patch', id: al.id, deliver_target_email: aliasCibleDraft.trim() })
                              }
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-slate-500"
                              onClick={() => {
                                setEditingAliasCibleId(null)
                                setAliasCibleDraft('')
                              }}
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-[11px] text-left text-brand-600 dark:text-brand-400 hover:underline w-fit"
                            onClick={() => {
                              setEditingAliasCibleId(al.id)
                              setAliasCibleDraft(al.deliver_target_email ?? '')
                            }}
                          >
                            {al.deliver_target_email ? 'Modifier la cible' : 'Définir la cible (Pass / transfert)'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="email"
                        value={newAliasEmail}
                        onChange={(e) => setNewAliasEmail(e.target.value)}
                        placeholder="alias@domaine.com"
                        className="flex-1 min-w-[160px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                      <input
                        type="text"
                        value={newAliasLabel}
                        onChange={(e) => setNewAliasLabel(e.target.value)}
                        placeholder="Libellé (optionnel)"
                        className="flex-1 min-w-[120px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                    </div>
                    <input
                      type="text"
                      value={newAliasDeliverTarget}
                      onChange={(e) => setNewAliasDeliverTarget(e.target.value)}
                      placeholder="Cible de livraison (optionnel) — ex. boîte réelle ou note Pass"
                      className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      disabled={aliasMutation.isPending || !newAliasEmail.trim()}
                      onClick={() => aliasMutation.mutate({ type: 'add' })}
                      className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs px-3 py-1.5 font-medium disabled:opacity-50 w-fit"
                    >
                      Ajouter l’alias
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400">Règles et dossiers personnalisés : à venir.</p>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-600 shrink-0">
              <button
                type="button"
                onClick={() => setShowMailSettings(false)}
                className="rounded-lg bg-slate-200 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500 w-full sm:w-auto"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showConnectEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6 my-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Ajouter une boîte mail</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Saisissez l’adresse et le mot de passe. Le mot de passe est stocké de façon sécurisée pour la synchronisation (IMAP) et l’envoi (SMTP).
            </p>
            <p className="text-xs text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 rounded-lg px-3 py-2 mb-4">
              <strong>Gmail sans mot de passe d’application :</strong> fermez cette fenêtre et utilisez « Se connecter avec Google » sur la page Mail (OAuth). Ce formulaire sert aux boîtes IMAP/SMTP classiques.
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
                {effectiveAccountId != null && composeFromOptions.length > 0 ? (
                  <div>
                    <label htmlFor={`mail-from-${slot.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      De
                    </label>
                    <select
                      id={`mail-from-${slot.id}`}
                      value={slot.fromAddress}
                      onChange={(e) => updateSlot(slot.id, { fromAddress: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      {composeFromOptions.map((em) => (
                        <option key={em} value={em}>
                          {em}
                        </option>
                      ))}
                    </select>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Boîte principale ou alias enregistré (Paramètres Mail). Le serveur doit autoriser l’envoi pour cette adresse.
                    </p>
                  </div>
                ) : null}
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMailSelectionMode(true)
              setSelectedMessageIds((prev) => (prev.includes(contextMenuMessage.id) ? prev : [...prev, contextMenuMessage.id]))
              setContextMenuMessage(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <CheckSquare className="h-4 w-4 shrink-0" /> Sélectionner
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              handleOpenContactFromMail(contextMenuMessage.from)
              setContextMenuMessage(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Users className="h-4 w-4 shrink-0" /> Ouvrir dans Contacts
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void handleQuickAddContactFromMail(contextMenuMessage.from)
              setContextMenuMessage(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4 shrink-0" /> Ajouter aux contacts
          </button>
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
