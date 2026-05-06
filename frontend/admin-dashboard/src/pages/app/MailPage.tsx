import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail,
  Inbox,
  Send,
  FileText,
  X,
  PenLine,
  Paperclip,
  FolderOpen,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Reply,
  Forward,
  Minimize2,
  Maximize2,
  Trash2,
  MoreVertical,
  CheckSquare,
  Square,
  MailOpen,
  ShieldAlert,
  KeyRound,
  MessagesSquare,
  Download,
  UserPlus,
  Users,
  Archive,
  ArrowUp,
  ArrowDown,
  Tag,
  Layers,
  Plus,
  Settings,
  Star,
  Briefcase,
  Bookmark,
  Flag,
  ShoppingCart,
  Home,
  CalendarPlus,
  CalendarClock,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import { useAppPageChromeSetters } from '../../appPageChromeContext'
import { MailAppChromeMenu } from './MailPageChrome'
import { useNotifications } from '../../notificationsContext'
import {
  apiUrl,
  fetchDriveNodes,
  fetchMailAccounts,
  createMailAccount,
  deleteMailAccount,
  fetchMailMessages,
  fetchUnifiedMailMessages,
  fetchMailMessage,
  downloadMailAttachment,
  markMailMessageRead,
  markMailMessagesReadBulk,
  moveMailMessageToFolder,
  moveMailMessagesToFolderBulk,
  deleteMailMessagePermanently,
  syncMailAccount,
  sendMailMessage,
  scheduleMailMessage,
  getMailGoogleOAuthRedirectUrl,
  fetchContacts,
  createCalendarEvent,
  fetchMailAliases,
  fetchMailFilterRules,
  fetchMailFolderSummary,
  fetchMailImapFolders,
  createMailImapFolder,
  renameMailImapFolder,
  deleteMailImapFolder,
  fetchMailTags,
  createMailTag,
  putMailMessageTags,
  createMailAlias,
  patchMailAlias,
  deleteMailAlias,
  fetchVaults,
  fetchVaultItems,
  deleteMailFilterRule,
  patchMailFilterRule,
  updateMailAccount,
  createMailFilterRule,
  applyMailFilterRules,
  createContact,
  type DriveNode,
  type MailMessageResponse,
  type MailAccountResponse,
  type MailFolderId,
  type MailStandardFolderId,
  type MailFolderSummaryResponse,
  type ContactResponse,
  type MailImapFolderRow,
  type MailFilterRuleResponse,
  type MailAccountAliasResponse,
  type VaultResponse,
  type PassItemResponse,
} from '../../api'

const STORAGE_RECENT_RECIPIENTS = 'cloudity_mail_recent_recipients'
const STORAGE_MAIL_SIGNATURE = 'cloudity_mail_signature'
const STORAGE_SIDEBAR_COLLAPSED = 'cloudity_mail_sidebar_collapsed'
const STORAGE_SIDEBAR_WIDTH_PX = 'cloudity_mail_sidebar_width_px'
const STORAGE_LIST_SPLIT_PCT = 'cloudity_mail_list_split_pct'
const STORAGE_MAIL_SHOW_FULL_HEADERS = 'cloudity_mail_show_full_headers'
const STORAGE_MAIL_BULK_TAG_SELECTION = 'cloudity_mail_bulk_tag_selection'
const MAIL_SIDEBAR_MIN_PX = 200
const MAIL_SIDEBAR_MAX_PX = 560
const MAIL_LIST_PREVIEW_MIN_PCT = 12
const MAIL_LIST_PREVIEW_MAX_PCT = 88
const STORAGE_DRAFT_PREFIX = 'cloudity_mail_draft_'
const MESSAGES_PAGE_SIZE = 25
/** Aligné sur le backend : pièces jointes au-delà ne sont pas mises en cache en base. */
const MAIL_INLINE_ATTACHMENT_MAX_BYTES = 512 * 1024
/**
 * Sync IMAP en arrière-plan sur la page Mail : toutes les boîtes reliées.
 * Plus court que l’ancien 25 s pour voir les messages entrants sans attendre une minute ;
 * reste compatible avec MAIL_AUTO_SYNC_MIN_GAP_MS (anti-chevauchement).
 */
const MAIL_BACKGROUND_SYNC_INTERVAL_MS = 12_000
/** Évite de relancer une sync complète au retour sur l’onglet juste après un tick de fond. */
const MAIL_VISIBILITY_SYNC_MIN_GAP_MS = 14_000
/** Anti-rafale : délai mini entre deux batches auto (polling/visible). */
const MAIL_AUTO_SYNC_MIN_GAP_MS = 12_000

/**
 * Lignes « non lu » dans la liste : 1 = uni, 2 = dégradé teinté, 3 = halo + barre + cadre (défaut).
 * Si le rendu ne convient pas, essayez 2 (dégradé sans blanc).
 */
const MAIL_UNREAD_ROW_VARIANT: 1 | 2 | 3 = 3

function mailUnreadListRowSurface(selected: boolean): string {
  const bar = 'border-l-[5px] border-l-brand-500'
  switch (MAIL_UNREAD_ROW_VARIANT) {
    case 1:
      if (selected) {
        return `border border-brand-300/70 dark:border-brand-600/50 ${bar} bg-slate-200 dark:bg-slate-800 hover:bg-slate-300/80 dark:hover:bg-slate-700`
      }
      return `border border-slate-300/70 dark:border-slate-600/80 ${bar} bg-slate-200/90 dark:bg-slate-800/95 hover:bg-slate-300/85 dark:hover:bg-slate-700`
    case 2:
      if (selected) {
        return `border border-brand-300/70 dark:border-brand-600/50 ${bar} bg-gradient-to-r from-slate-300/95 via-brand-100/80 to-slate-200 dark:from-slate-900 dark:via-brand-950/50 dark:to-slate-800`
      }
      return `border border-slate-300/70 dark:border-slate-600/80 ${bar} bg-gradient-to-r from-slate-300/90 via-slate-200 to-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900`
    case 3:
      if (selected) {
        return `border border-brand-300/70 dark:border-brand-600/50 ${bar} bg-slate-200 dark:bg-slate-800 ring-2 ring-inset ring-brand-400/35 dark:ring-brand-500/25`
      }
      return `border border-slate-300/70 dark:border-slate-600/80 ${bar} bg-slate-200/80 dark:bg-slate-800/95 ring-1 ring-inset ring-brand-400/40 dark:ring-brand-500/20`
  }
}

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

function getMailShowFullHeaders(): boolean {
  try {
    return localStorage.getItem(STORAGE_MAIL_SHOW_FULL_HEADERS) === '1'
  } catch {
    return false
  }
}

function saveMailShowFullHeaders(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_MAIL_SHOW_FULL_HEADERS, on ? '1' : '0')
  } catch {
    /* ignore */
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
  draft: { to: string; subject: string; body: string; fromAddress?: string } | null,
  options?: { keepEmpty?: boolean }
): void {
  try {
    const key = getDraftKey(accountId)
    if (!draft || (!options?.keepEmpty && !draft.to.trim() && !draft.subject.trim() && !draft.body.trim())) {
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

/** Sélection multi-messages : IDs + boîte d’origine pour actions IMAP correctes (vue unifiée). */
type MessageListSelection = { ids: number[]; accountById: Record<number, number> }

const MAIL_FOLDER_ICON_PICKS: { name: string; Icon: typeof Inbox }[] = [
  { name: 'FolderOpen', Icon: FolderOpen },
  { name: 'Inbox', Icon: Inbox },
  { name: 'Send', Icon: Send },
  { name: 'Archive', Icon: Archive },
  { name: 'FileText', Icon: FileText },
  { name: 'Tag', Icon: Tag },
  { name: 'Star', Icon: Star },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Bookmark', Icon: Bookmark },
  { name: 'Flag', Icon: Flag },
  { name: 'ShoppingCart', Icon: ShoppingCart },
  { name: 'Home', Icon: Home },
  { name: 'Users', Icon: Users },
  { name: 'KeyRound', Icon: KeyRound },
]

const MAIL_FOLDER_ICON_BY_NAME = Object.fromEntries(MAIL_FOLDER_ICON_PICKS.map((o) => [o.name, o.Icon])) as Record<
  string,
  typeof Inbox
>

function renderMailImapUiIcon(ui_icon: string | undefined): React.ReactNode {
  const n = (ui_icon ?? '').trim()
  const Ico = MAIL_FOLDER_ICON_BY_NAME[n]
  if (Ico) return <Ico className="h-4 w-4 flex-shrink-0 opacity-90" aria-hidden />
  if (n.length > 0 && n.length <= 8 && !/\s/.test(n)) {
    return (
      <span className="text-sm shrink-0 w-4 text-center leading-none" aria-hidden>
        {n}
      </span>
    )
  }
  return <FolderOpen className="h-4 w-4 flex-shrink-0 opacity-80" aria-hidden />
}

const STANDARD_FOLDER_IDS = new Set<string>(['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'])

function isStandardMailFolderId(f: string): boolean {
  return STANDARD_FOLDER_IDS.has(f)
}

/** En vue « tout » ou « unifié », les actions (archiver, spam…) se basent sur le dossier réel du message. */
function effectiveMsgFolderForActions(activeFolder: string, msgFolder: string | undefined): string {
  if (activeFolder === 'all' || activeFolder === 'unified') return (msgFolder ?? 'inbox').toLowerCase()
  return activeFolder
}

function showMailArchiveAction(activeFolder: string, msgFolder: string | undefined): boolean {
  const ef = effectiveMsgFolderForActions(activeFolder, msgFolder)
  return ef !== 'archive' && ef !== 'trash'
}

function showMailTrashAction(activeFolder: string, msgFolder: string | undefined): boolean {
  return effectiveMsgFolderForActions(activeFolder, msgFolder) !== 'trash'
}

function showMailSpamAction(activeFolder: string, msgFolder: string | undefined): boolean {
  return effectiveMsgFolderForActions(activeFolder, msgFolder) === 'inbox'
}

function showMailRestoreInboxAction(activeFolder: string, msgFolder: string | undefined): boolean {
  const ef = effectiveMsgFolderForActions(activeFolder, msgFolder)
  return ef === 'spam' || ef === 'trash' || ef === 'archive'
}

/** Dossier cible par défaut dans l’assistant « règle depuis ce message » (standard ou dossier IMAP courant). */
function ruleAssistantDefaultActionFolder(msgFolder: string | undefined): MailFolderId {
  const raw = (msgFolder ?? '').trim()
  if (!raw) return 'inbox'
  const f = raw.toLowerCase()
  if (STANDARD_FOLDER_IDS.has(f)) return f as MailFolderId
  return raw as MailFolderId
}

function parsePassAliasTarget(raw: string | undefined): { vaultId: number; itemId: number } | null {
  const v = (raw || '').trim()
  const m = /^pass:\/\/vault\/(\d+)\/item\/(\d+)$/i.exec(v)
  if (!m) return null
  const vaultId = Number.parseInt(m[1] || '', 10)
  const itemId = Number.parseInt(m[2] || '', 10)
  if (!Number.isFinite(vaultId) || !Number.isFinite(itemId) || vaultId <= 0 || itemId <= 0) return null
  return { vaultId, itemId }
}

function passAliasTargetLabel(raw: string | undefined, vaults: VaultResponse[]): string {
  const parsed = parsePassAliasTarget(raw)
  if (!parsed) return raw || ''
  const v = vaults.find((x) => x.id === parsed.vaultId)
  return `Pass → ${v?.name || `Coffre #${parsed.vaultId}`} / Entrée #${parsed.itemId}`
}
function isAliasDeliverTargetValid(raw: string | undefined): boolean {
  const v = (raw || '').trim()
  if (!v) return true
  if (parsePassAliasTarget(v)) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function aliasDeliverTargetValidationMessage(raw: string | undefined): string {
  const v = (raw || '').trim()
  if (!v) return ''
  if (isAliasDeliverTargetValid(v)) return ''
  return 'Format invalide: utilisez un e-mail ou pass://vault/<id>/item/<id>'
}


function folderDisplayLabel(folder: string | undefined, imapLabels: Map<string, string>): string {
  const raw = folder ?? ''
  const f = raw.toLowerCase().trim()
  switch (f) {
    case 'inbox':
      return 'Réception'
    case 'sent':
      return 'Envoyés'
    case 'drafts':
      return 'Brouillons'
    case 'archive':
      return 'Archives'
    case 'spam':
      return 'Spam'
    case 'trash':
      return 'Corbeille'
    case 'scheduled':
      return 'Programmée'
    default: {
      if (f.endsWith('.trash') || f.endsWith('/trash') || f === 'inbox.trash') return 'Corbeille'
      const fromMap = raw ? imapLabels.get(raw) : undefined
      const lab = fromMap || raw || '—'
      if (lab.trim().toLowerCase() === 'trash') return 'Corbeille'
      return lab
    }
  }
}

/** Taille approximative du menu actions message (fixed) pour le calage à l’écran. */
const MAIL_ACTION_MENU_W = 240
const MAIL_ACTION_MENU_H = 380
const MAIL_ACTION_MENU_MARGIN = 8

function clampMailActionMenuPosition(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y }
  const m = MAIL_ACTION_MENU_MARGIN
  const w = MAIL_ACTION_MENU_W
  const h = MAIL_ACTION_MENU_H
  const cx = Math.max(m, Math.min(x, window.innerWidth - w - m))
  const cy = Math.max(m, Math.min(y, window.innerHeight - h - m))
  return { x: cx, y: cy }
}

/** Position sous le bouton « … », puis bornée dans la fenêtre. */
function mailActionMenuPositionBelowButton(rect: DOMRect): { x: number; y: number } {
  const w = MAIL_ACTION_MENU_W
  const m = MAIL_ACTION_MENU_MARGIN
  const x = rect.right - w
  const y = rect.bottom + 6
  return clampMailActionMenuPosition(x, y)
}

/** Dossiers déjà couverts par la sync standard : ne pas dupliquer dans la liste IMAP (comparaison insensible à la casse). */
const RESERVED_IMAP_PATHS_LOWER = new Set(
  [
    'INBOX',
    'Sent',
    '[Gmail]/Sent Mail',
    'INBOX.Sent',
    'INBOX.Envoyés',
    'Envoyés',
    'Drafts',
    '[Gmail]/Drafts',
    'INBOX.Drafts',
    'Brouillons',
    'INBOX.Brouillons',
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
    '[Gmail]/Bin',
    'Deleted Messages',
    'Bin',
    'INBOX.Trash',
    'Corbeille',
    'INBOX.Corbeille',
    'Courrier indésirable',
    'INBOX.Courrier indésirable',
  ].map((s) => s.toLowerCase())
)

function isReservedImapPathForSidebar(path: string): boolean {
  return RESERVED_IMAP_PATHS_LOWER.has(path.trim().toLowerCase())
}

/** Dossier LIST déjà mappé sur une entrée standard (Corbeille, Spam, …) : pas de doublon dans « autres dossiers ». */
function shouldHideImapFolderFromSidebar(row: MailImapFolderRow): boolean {
  const sp = (row.imap_special_use ?? '').trim().toLowerCase()
  if (['trash', 'spam', 'drafts', 'sent', 'archive'].includes(sp)) return true
  const p = row.imap_path.trim()
  if (p.toLowerCase() === 'scheduled') return true
  if (p.toLowerCase() === 'inbox') return true
  return isReservedImapPathForSidebar(p)
}

/** Aligné sur le backend : pas de création de sous-dossier sous ces rôles IMAP. */
function imapSpecialRoleBlocksSubfolderCreation(role: string | undefined): boolean {
  const r = (role ?? '').trim().toLowerCase()
  return ['drafts', 'sent', 'spam', 'trash'].includes(r)
}

/** Empêche de supprimer la boîte = email de connexion Cloudity (côté API aussi). */
function isMailboxSameAsLoginEmail(mailboxEmail: string, loginEmail: string | null | undefined): boolean {
  const m = mailboxEmail.trim().toLowerCase()
  const u = (loginEmail ?? '').trim().toLowerCase()
  return m !== '' && u !== '' && m === u
}

function folderSidebarBadge(
  id: MailStandardFolderId,
  summary: MailFolderSummaryResponse | undefined,
  localDraftsCount = 0
): string | null {
  const s = summary?.[id]
  if (id === 'drafts') {
    const total = Math.max(s?.total ?? 0, localDraftsCount)
    return total > 0 ? String(total) : null
  }
  if (!s) return null
  if (id === 'inbox' || id === 'spam') return s.unread > 0 ? String(s.unread) : null
  if (id === 'trash') return s.total > 0 ? String(s.total) : null
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

function scheduledFolderSidebarBadge(summary: MailFolderSummaryResponse | undefined): string | null {
  const row = summary?.extra?.find((e) => e.folder.trim().toLowerCase() === 'scheduled')
  if (!row) return null
  const t = row.total ?? 0
  return t > 0 ? String(t) : null
}

type AttachmentFromDrive = { nodeId: number; name: string; size: number }

export type ComposeSlot = {
  id: string
  title: string
  /** Adresse d’affichage « De » (boîte principale ou alias enregistré). */
  fromAddress: string
  /** Compte d’envoi (réponse depuis une autre boîte, ex. vue unifiée). */
  sendAccountId?: number
  to: string
  subject: string
  body: string
  minimized: boolean
  attachments: AttachmentFromDrive[]
  /** Position horizontale depuis la droite (desktop), pour glisser la fenêtre en bas. */
  xOffsetPx: number
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function plainTextToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>')
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

function getSavedBulkTagSelection(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_MAIL_BULK_TAG_SELECTION)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((x) => Number.parseInt(String(x), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 20)
  } catch {
    return []
  }
}

/** Extrait l'adresse email depuis "Name <email>" ou renvoie la chaîne si déjà une adresse. */
function extractEmailFromSender(from: string | undefined): string | null {
  if (!from?.trim()) return null
  const m = /<([^>]+)>/.exec(from)
  const email = m ? m[1].trim() : from.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/** Domaine de l’expéditeur (pour règles « domaine uniquement »). */
function extractDomainFromSender(from: string | undefined): string {
  const em = extractEmailFromSender(from)
  if (em) {
    const i = em.lastIndexOf('@')
    return i >= 0 ? em.slice(i + 1).toLowerCase().trim() : ''
  }
  const raw = (from || '').toLowerCase()
  const lt = raw.lastIndexOf('<')
  const gt = raw.lastIndexOf('>')
  const inner = lt >= 0 && gt > lt ? raw.slice(lt + 1, gt) : raw
  const at = inner.lastIndexOf('@')
  if (at >= 0 && at < inner.length - 1) {
    const part = inner
      .slice(at + 1)
      .replace(/>/g, '')
      .trim()
      .split(/[\s;,]/)[0]
    return part ?? ''
  }
  return ''
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

/** URL de favicon via proxy backend Cloudity (cache serveur, pas d'appel tiers direct depuis le navigateur). */
function mailFaviconCandidateUrlsFromEmail(senderEmail: string | null): string[] {
  if (!senderEmail) return []
  const at = senderEmail.lastIndexOf('@')
  if (at < 0 || at >= senderEmail.length - 1) return []
  const domain = senderEmail.slice(at + 1).trim().toLowerCase()
  if (!domain) return []
  return [apiUrl(`/mail/favicon?domain=${encodeURIComponent(domain)}`)]
}

function senderAvatarInitials(from: string | undefined, contactName?: string | null): string {
  const { displayName } = parseFromHeader(from)
  const base = (contactName?.trim() || displayName.trim() || extractEmailFromSender(from) || '?').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  return base.slice(0, 2).toUpperCase()
}

/** Rend les emails/URL cliquables dans les en-têtes MIME bruts. */
function renderTextWithLinks(text: string, keyPrefix: string): React.ReactNode[] {
  const re = /(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let idx = 0
  while ((m = re.exec(text)) !== null) {
    const start = m.index
    const match = m[0]
    if (start > last) out.push(text.slice(last, start))
    const isMail = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(match)
    const href = isMail ? `mailto:${match}` : match
    out.push(
      <a
        key={`${keyPrefix}-lk-${idx++}`}
        href={href}
        target={isMail ? undefined : '_blank'}
        rel={isMail ? undefined : 'noopener noreferrer'}
        className="underline decoration-slate-400 hover:decoration-brand-500 text-brand-700 dark:text-brand-300"
      >
        {match}
      </a>
    )
    last = start + match.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function unfoldIcsLines(input: string): string[] {
  const raw = input.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out
}

function parseIcsDate(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^\d{8}T\d{6}Z$/.test(v)) {
    const y = Number(v.slice(0, 4))
    const m = Number(v.slice(4, 6))
    const d = Number(v.slice(6, 8))
    const hh = Number(v.slice(9, 11))
    const mm = Number(v.slice(11, 13))
    const ss = Number(v.slice(13, 15))
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss)).toISOString()
  }
  if (/^\d{8}T\d{6}$/.test(v)) {
    const y = Number(v.slice(0, 4))
    const m = Number(v.slice(4, 6))
    const d = Number(v.slice(6, 8))
    const hh = Number(v.slice(9, 11))
    const mm = Number(v.slice(11, 13))
    const ss = Number(v.slice(13, 15))
    return new Date(y, m - 1, d, hh, mm, ss).toISOString()
  }
  if (/^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4))
    const m = Number(v.slice(4, 6))
    const d = Number(v.slice(6, 8))
    return new Date(y, m - 1, d, 9, 0, 0).toISOString()
  }
  const dt = new Date(v)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function parseIcsFirstEvent(ics: string): { title: string; startAt: string; endAt: string; location?: string; description?: string } | null {
  const lines = unfoldIcsLines(ics)
  let inEvent = false
  const fields: Record<string, string> = {}
  for (const line of lines) {
    if (line.trim().toUpperCase() === 'BEGIN:VEVENT') {
      inEvent = true
      continue
    }
    if (line.trim().toUpperCase() === 'END:VEVENT') break
    if (!inEvent) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const k = line.slice(0, idx).split(';')[0].trim().toUpperCase()
    const v = line.slice(idx + 1).trim()
    if (!fields[k]) fields[k] = v
  }
  const startAt = parseIcsDate(fields.DTSTART || '')
  if (!startAt) return null
  const endAt = parseIcsDate(fields.DTEND || '')
  const start = new Date(startAt)
  const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000).toISOString()
  return {
    title: fields.SUMMARY?.trim() || 'Événement importé (.ics)',
    startAt,
    endAt: endAt || fallbackEnd,
    location: fields.LOCATION?.trim() || undefined,
    description: fields.DESCRIPTION?.replace(/\\n/g, '\n').trim() || undefined,
  }
}

function parseMailSearchQuery(raw: string): {
  plainTerms: string[]
  tagTerms: string[]
  senderTerms: string[]
  subjectTerms: string[]
  unreadOnly: boolean
  readOnly: boolean
  withAttachmentsOnly: boolean
} {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const plainTerms: string[] = []
  const tagTerms: string[] = []
  const senderTerms: string[] = []
  const subjectTerms: string[] = []
  let unreadOnly = false
  let readOnly = false
  let withAttachmentsOnly = false

  for (const t of tokens) {
    const low = t.toLowerCase()
    if (/^[a-z][a-z0-9_-]*:$/.test(low)) {
      // Opérateur incomplet (`from:`, `subject:`, `tag:`...) :
      // ne pas l'envoyer en FTS serveur, sinon résultats bruités/non pertinents.
      continue
    }
    if (t.startsWith('#') && t.length > 1) {
      tagTerms.push(t.slice(1).toLowerCase())
      continue
    }
    if (t.startsWith('$') && t.length > 1) {
      senderTerms.push(t.slice(1).toLowerCase())
      continue
    }
    if (low.startsWith('from:') && low.length > 'from:'.length) {
      senderTerms.push(low.slice('from:'.length))
      continue
    }
    if (low.startsWith('subject:') && low.length > 'subject:'.length) {
      subjectTerms.push(low.slice('subject:'.length))
      continue
    }
    if (low.startsWith('tag:') && low.length > 'tag:'.length) {
      tagTerms.push(low.slice('tag:'.length))
      continue
    }
    if (low === 'is:unread' || low === 'is:nonlu') {
      unreadOnly = true
      continue
    }
    if (low === 'is:read' || low === 'is:lu') {
      readOnly = true
      continue
    }
    if (low === 'has:att' || low === 'has:pj' || low === 'has:attachment') {
      withAttachmentsOnly = true
      continue
    }
    plainTerms.push(low)
  }
  return { plainTerms, tagTerms, senderTerms, subjectTerms, unreadOnly, readOnly, withAttachmentsOnly }
}

function sanitizeMailHtmlUnsafeInput(raw: string): string {
  if (!raw.trim()) return ''
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    doc.querySelectorAll('script, iframe, object, embed, form, meta, base, link[rel="import"]').forEach((n) => n.remove())
    doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const attrs = Array.from(el.attributes)
      for (const a of attrs) {
        const name = a.name.toLowerCase()
        const value = a.value.trim().toLowerCase()
        if (name.startsWith('on')) el.removeAttribute(a.name)
        if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
          el.removeAttribute(a.name)
        }
      }
    })
    return doc.body.innerHTML
  } catch {
    return ''
  }
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
  const email = extractEmailFromSender(from)
  const src = useMemo(() => mailFaviconCandidateUrlsFromEmail(email)[0] ?? null, [email])
  const initials = senderAvatarInitials(from, contact?.name)
  return (
    <div
      className="relative h-9 w-9 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600 dark:from-indigo-600 dark:to-violet-700 flex items-center justify-center text-[11px] font-bold text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      title={contact?.name ? `${contact.name} (${email || ''})` : email || undefined}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover bg-white dark:bg-slate-800"
          onError={(e) => {
            // Fallback purement DOM (sans setState) pour éviter tout risque de boucle React.
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
      <span aria-hidden>{initials}</span>
    </div>
  )
}

export default function MailPage() {
  const navigate = useNavigate()
  const { accessToken, email: authLoginEmail, refreshAccessTokenIfNeeded } = useAuth()
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
  /** Regroupe la liste par fil (1 ligne par conversation) sans changer les appels API. */
  const [conversationListMode, setConversationListMode] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [composeSlots, setComposeSlots] = useState<ComposeSlot[]>([])
  const [activeComposeId, setActiveComposeId] = useState<string | null>(null)
  const [scheduleModalForSlotId, setScheduleModalForSlotId] = useState<string | null>(null)
  const [scheduledLocalDateTime, setScheduledLocalDateTime] = useState('')
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
  const [mailSearchText, setMailSearchText] = useState('')
  const [mailSearchSubject, setMailSearchSubject] = useState(true)
  const [mailSearchSender, setMailSearchSender] = useState(true)
  const [mailSearchUnreadOnly, setMailSearchUnreadOnly] = useState(false)
  const [mailSearchWithAttachmentsOnly, setMailSearchWithAttachmentsOnly] = useState(false)
  /** Avec recherche serveur (`q`) : tri par pertinence (défaut) ou date pure. */
  const [mailSearchSort, setMailSearchSort] = useState<'rank' | 'date'>('rank')
  const [mailSearchPopoverOpen, setMailSearchPopoverOpen] = useState(false)
  const mailSearchPopoverRef = useRef<HTMLDivElement | null>(null)
  const mailSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [similarSenderFilter, setSimilarSenderFilter] = useState<string | null>(null)
  const [mailCompactUi, setMailCompactUi] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
  /** Compte IMAP du message ouvert (obligatoire en vue unifiée). */
  const [selectedMessageAccountId, setSelectedMessageAccountId] = useState<number | null>(null)
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
  const composeDragRef = useRef<{
    id: string
    startClientX: number
    startOffset: number
    moved: boolean
  } | null>(null)
  const composeDragIgnoreClickRef = useRef(false)
  const [mailSignature, setMailSignature] = useState(getMailSignature())
  const [contextMenuMessage, setContextMenuMessage] = useState<{
    id: number
    account_id: number
    x: number
    y: number
    is_read?: boolean
    from?: string
    subject?: string
    folder?: string
    tag_ids?: number[]
    thread_key?: string | null
  } | null>(null)
  /** Faux : pas de cases à cocher ; appui long ou menu → sélection (style client mail). */
  const [mailSelectionMode, setMailSelectionMode] = useState(false)
  const longPressRef = useRef<{ timer: number | null; fired: boolean }>({
    timer: null,
    fired: false,
  })
  const [listMsgSelection, setListMsgSelection] = useState<MessageListSelection>({ ids: [], accountById: {} })
  const selectedMessageIds = listMsgSelection.ids
  const selectionAccountByMessageId = listMsgSelection.accountById
  const [bulkWorking, setBulkWorking] = useState(false)
  const [bulkTagPickerOpen, setBulkTagPickerOpen] = useState(false)
  const [bulkTagSelection, setBulkTagSelection] = useState<number[]>(getSavedBulkTagSelection)
  const bulkTagPickerRef = useRef<HTMLDivElement | null>(null)
  const [selectingAllInScope, setSelectingAllInScope] = useState(false)
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
  const [aliasTargetVaultId, setAliasTargetVaultId] = useState<number | null>(null)
  const [aliasTargetItemId, setAliasTargetItemId] = useState<number | null>(null)
  const [editingAliasCibleId, setEditingAliasCibleId] = useState<number | null>(null)
  const [aliasCibleDraft, setAliasCibleDraft] = useState('')
  const newAliasDeliverTargetError = useMemo(() => aliasDeliverTargetValidationMessage(newAliasDeliverTarget), [newAliasDeliverTarget])
  const aliasCibleDraftError = useMemo(() => aliasDeliverTargetValidationMessage(aliasCibleDraft), [aliasCibleDraft])
  const [newMailTagName, setNewMailTagName] = useState('')
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleFromPattern, setNewRuleFromPattern] = useState('')
  const [newRuleFromDomainPattern, setNewRuleFromDomainPattern] = useState('')
  const [newRuleRecipientPattern, setNewRuleRecipientPattern] = useState('')
  const [newRuleHasTagId, setNewRuleHasTagId] = useState<number | null>(null)
  const [newRuleAddTagId, setNewRuleAddTagId] = useState<number | null>(null)
  const [newRuleSubjectPattern, setNewRuleSubjectPattern] = useState('')
  const [newRuleActionFolder, setNewRuleActionFolder] = useState<MailFolderId>('inbox')
  const [newRuleHasAttachmentsOnly, setNewRuleHasAttachmentsOnly] = useState(false)
  const [newRuleMarkRead, setNewRuleMarkRead] = useState(false)
  const [newRuleOrder, setNewRuleOrder] = useState('1000')
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const canSubmitRule = useMemo(() => {
    const fromPattern = newRuleFromPattern.trim()
    const fromDomainPattern = newRuleFromDomainPattern.trim()
    const recipientPattern = newRuleRecipientPattern.trim()
    const subjectPattern = newRuleSubjectPattern.trim()
    const hasTagId = newRuleHasTagId && newRuleHasTagId > 0
    return Boolean(fromPattern || fromDomainPattern || recipientPattern || subjectPattern || newRuleHasAttachmentsOnly || hasTagId)
  }, [
    newRuleFromPattern,
    newRuleFromDomainPattern,
    newRuleRecipientPattern,
    newRuleSubjectPattern,
    newRuleHasTagId,
    newRuleHasAttachmentsOnly,
  ])
  const [showFullMailHeaders, setShowFullMailHeaders] = useState(getMailShowFullHeaders)
  /** Liste des boîtes repliée : une ligne pour la boîte active ; dépliée pour changer de compte. */
  const [mailboxesListExpanded, setMailboxesListExpanded] = useState(false)
  const [showCreateImapFolderModal, setShowCreateImapFolderModal] = useState(false)
  const [newImapFolderPathInput, setNewImapFolderPathInput] = useState('')
  const [newImapFolderParentPath, setNewImapFolderParentPath] = useState('INBOX')
  const [newImapFolderColor, setNewImapFolderColor] = useState('')
  const [newImapFolderIcon, setNewImapFolderIcon] = useState('')
  const [creatingImapFolder, setCreatingImapFolder] = useState(false)
  const [imapFolderCtx, setImapFolderCtx] = useState<null | { x: number; y: number; row: MailImapFolderRow }>(null)
  const [imapRenameTarget, setImapRenameTarget] = useState<null | { imap_path: string; label: string }>(null)
  const [imapRenameDraft, setImapRenameDraft] = useState('')
  const [imapRenameSaving, setImapRenameSaving] = useState(false)
  const [imapDeleteTarget, setImapDeleteTarget] = useState<null | { imap_path: string; label: string }>(null)
  const [imapDeleteWorking, setImapDeleteWorking] = useState(false)

  const { data: accountsData, isPending: accountsPending, isError: accountsError, error: accountsErrorDetail } = useQuery({
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
    if (isStandardMailFolderId(f) || f === 'all' || f === 'unified') return undefined
    return { extra_imap_folders: [f] }
  }, [])

  const { data: accountAliases = [] } = useQuery<MailAccountAliasResponse[]>({
    queryKey: ['mail', 'aliases', effectiveAccountId],
    queryFn: () => fetchMailAliases(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
  })

  const { data: passVaults = [] } = useQuery({
    queryKey: ['pass', 'vaults'],
    queryFn: () => fetchVaults(accessToken!),
    enabled: !!accessToken && showMailSettings,
    staleTime: 45_000,
  })

  const { data: passVaultItems = [] } = useQuery({
    queryKey: ['pass', 'vault-items', aliasTargetVaultId],
    queryFn: () => fetchVaultItems(accessToken!, aliasTargetVaultId!),
    enabled: !!accessToken && showMailSettings && aliasTargetVaultId != null,
    staleTime: 30_000,
  })

  const { data: folderSummary } = useQuery({
    queryKey: ['mail', 'folder-summary', effectiveAccountId],
    queryFn: () => fetchMailFolderSummary(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
    staleTime: 15_000,
  })

  /** Badge « Tous les dossiers » : hors corbeille / spam / brouillons (même logique que l’API `folder=all`). */
  const allMessagesBadgeTotal = useMemo(() => {
    if (!folderSummary) return null
    let n = 0
    const inAllView: MailStandardFolderId[] = ['inbox', 'sent', 'archive']
    for (const id of inAllView) {
      n += folderSummary[id]?.total ?? 0
    }
    const excluded = new Set(['trash', 'spam', 'drafts', 'scheduled'])
    for (const e of folderSummary.extra ?? []) {
      if (excluded.has(e.folder.trim().toLowerCase())) continue
      n += e.total ?? 0
    }
    return n
  }, [folderSummary])

  const { data: imapFolders = [] } = useQuery({
    queryKey: ['mail', 'imap-folders', effectiveAccountId],
    queryFn: () => fetchMailImapFolders(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
    staleTime: 60_000,
  })

  const imapLabelByPath = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of imapFolders) {
      const sp = (r.imap_special_use ?? '').trim().toLowerCase()
      let lab = r.label?.trim() || r.imap_path
      if (sp === 'trash') lab = 'Corbeille'
      else if (sp === 'spam') lab = 'Spam'
      else if (sp === 'drafts') lab = 'Brouillons'
      else if (sp === 'sent') lab = 'Envoyés'
      else if (sp === 'archive') lab = 'Archives'
      m.set(r.imap_path, lab)
    }
    return m
  }, [imapFolders])

  const customImapSidebarRows = useMemo(
    () =>
      [...imapFolders]
        .filter((r) => !shouldHideImapFolderFromSidebar(r))
        .sort((a, b) => a.imap_path.localeCompare(b.imap_path)),
    [imapFolders]
  )

  const imapFolderParentOptions = useMemo(() => {
    const rows = [...imapFolders]
      .filter((r) => !imapSpecialRoleBlocksSubfolderCreation(r.imap_special_use))
      .sort((a, b) => a.imap_path.localeCompare(b.imap_path))
    if (rows.some((r) => r.imap_path.trim().toLowerCase() === 'inbox')) return rows
    return [
      {
        imap_path: 'INBOX',
        parent_imap_path: '',
        label: 'Boîte de réception',
        delimiter: '.',
      } as MailImapFolderRow,
      ...rows,
    ]
  }, [imapFolders])

  const newImapFolderPathSuggestions = useMemo(() => {
    const paths = [...new Set(imapFolders.map((r) => r.imap_path.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    )
    const q = newImapFolderPathInput.trim().toLowerCase()
    const hit = q ? paths.filter((p) => p.toLowerCase().includes(q)) : paths
    return hit.slice(0, 14)
  }, [imapFolders, newImapFolderPathInput])

  const { data: mailTags = [] } = useQuery({
    queryKey: ['mail', 'tags', effectiveAccountId],
    queryFn: () => fetchMailTags(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
    staleTime: 30_000,
  })

  const { data: mailRules = [] } = useQuery({
    queryKey: ['mail', 'rules', effectiveAccountId],
    queryFn: () => fetchMailFilterRules(accessToken!, effectiveAccountId!),
    enabled: !!accessToken && effectiveAccountId != null,
    staleTime: 30_000,
  })
  const safeMailRules = useMemo(
    () => (Array.isArray(mailRules) ? (mailRules as MailFilterRuleResponse[]) : []),
    [mailRules]
  )

  useEffect(() => {
    setRecipientAliasFilter((prev) => (prev == null ? prev : null))
  }, [effectiveAccountId])


  useEffect(() => {
    if (aliasTargetVaultId == null && passVaults.length > 0) {
      setAliasTargetVaultId(passVaults[0].id)
    }
  }, [aliasTargetVaultId, passVaults])

  useEffect(() => {
    setFilterTagId((prev) => (prev == null ? prev : null))
    setConversationThreadKey((prev) => (prev == null ? prev : null))
  }, [effectiveAccountId, activeFolder])

  useEffect(() => {
    setMessagePage((prev) => (prev === 0 ? prev : 0))
  }, [conversationThreadKey])

  useEffect(() => {
    setMessagePage((prev) => (prev === 0 ? prev : 0))
  }, [recipientAliasFilter])

  useEffect(() => {
    if (!mailSelectionMode && selectedMessageIds.length === 0) {
      setBulkTagPickerOpen(false)
    }
  }, [mailSelectionMode, selectedMessageIds.length])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MAIL_BULK_TAG_SELECTION, JSON.stringify(bulkTagSelection.slice(0, 20)))
    } catch {
      /* ignore */
    }
  }, [bulkTagSelection])

  useEffect(() => {
    if (!bulkTagPickerOpen) return
    const onDown = (ev: MouseEvent) => {
      const root = bulkTagPickerRef.current
      if (!root) return
      if (!root.contains(ev.target as Node)) setBulkTagPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [bulkTagPickerOpen])

  const aliasMutation = useMutation({
    mutationFn: async (
      mode: { type: 'add' } | { type: 'del'; id: number } | { type: 'patch'; id: number; deliver_target_email: string }
    ) => {
      if (!accessToken || effectiveAccountId == null) return
      if (mode.type === 'add') {
        const em = newAliasEmail.trim().toLowerCase()
        if (!em) throw new Error('Adresse alias requise')
        const target = newAliasDeliverTarget.trim()
        if (!isAliasDeliverTargetValid(target)) throw new Error(aliasDeliverTargetValidationMessage(target) || 'Cible invalide')
        await createMailAlias(accessToken, effectiveAccountId, {
          alias_email: em,
          label: newAliasLabel.trim() || undefined,
          deliver_target_email: target || undefined,
        })
        return
      }
      if (mode.type === 'patch') {
        const target = mode.deliver_target_email.trim()
        if (!isAliasDeliverTargetValid(target)) throw new Error(aliasDeliverTargetValidationMessage(target) || 'Cible invalide')
        await patchMailAlias(accessToken, effectiveAccountId, mode.id, { deliver_target_email: target })
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

  const mailRulesMutation = useMutation({
    mutationFn: async (mode: { type: 'add' } | { type: 'del'; id: number } | { type: 'apply' } | { type: 'patch'; id: number; enabledOnly?: boolean }) => {
      if (!accessToken || effectiveAccountId == null) return
      if (mode.type === 'add') {
        const name = newRuleName.trim() || 'Règle automatique'
        const fromPattern = newRuleFromPattern.trim()
        const fromDomainPattern = newRuleFromDomainPattern.trim()
        const subjectPattern = newRuleSubjectPattern.trim()
        const recipientPattern = newRuleRecipientPattern.trim().toLowerCase()
        const hasTagId = newRuleHasTagId && newRuleHasTagId > 0 ? newRuleHasTagId : undefined
        const addTagId = newRuleAddTagId && newRuleAddTagId > 0 ? newRuleAddTagId : undefined
        const ruleOrder = Number.parseInt(newRuleOrder.trim() || '1000', 10)
        const normalizedRuleOrder = Number.isFinite(ruleOrder) && ruleOrder >= 0 ? ruleOrder : 1000
        if (!fromPattern && !fromDomainPattern && !recipientPattern && !subjectPattern && !newRuleHasAttachmentsOnly && !hasTagId) {
          throw new Error('Ajoutez au moins une condition (expéditeur, domaine, destinataire, sujet, étiquette, ou PJ).')
        }
        await createMailFilterRule(accessToken, effectiveAccountId, {
          name,
          from_pattern: fromPattern || undefined,
          from_domain_pattern: fromDomainPattern || undefined,
          recipient_pattern: recipientPattern || undefined,
          has_tag_id: hasTagId,
          add_tag_id: addTagId,
          subject_pattern: subjectPattern || undefined,
          has_attachments: newRuleHasAttachmentsOnly ? true : undefined,
          action_folder: newRuleActionFolder,
          mark_read: newRuleMarkRead || undefined,
          enabled: true,
          rule_order: normalizedRuleOrder,
        })
        return
      }
      if (mode.type === 'patch') {
        if (mode.enabledOnly) {
          const target = safeMailRules.find((r) => r.id === mode.id)
          if (!target) throw new Error('Règle introuvable')
          await patchMailFilterRule(accessToken, effectiveAccountId, mode.id, { enabled: !target.enabled })
          return
        }
        const fromPattern = newRuleFromPattern.trim()
        const fromDomainPattern = newRuleFromDomainPattern.trim()
        const recipientPattern = newRuleRecipientPattern.trim().toLowerCase()
        const subjectPattern = newRuleSubjectPattern.trim()
        const hasTagId = newRuleHasTagId && newRuleHasTagId > 0 ? newRuleHasTagId : null
        const addTagId = newRuleAddTagId && newRuleAddTagId > 0 ? newRuleAddTagId : null
        const ruleOrder = Number.parseInt(newRuleOrder.trim() || '1000', 10)
        const normalizedRuleOrder = Number.isFinite(ruleOrder) && ruleOrder >= 0 ? ruleOrder : 1000
        if (!fromPattern && !fromDomainPattern && !recipientPattern && !subjectPattern && !newRuleHasAttachmentsOnly && !hasTagId) {
          throw new Error('Ajoutez au moins une condition (expéditeur, domaine, destinataire, sujet, étiquette, ou PJ).')
        }
        await patchMailFilterRule(accessToken, effectiveAccountId, mode.id, {
          name: newRuleName.trim() || 'Règle automatique',
          from_pattern: fromPattern || '',
          from_domain_pattern: fromDomainPattern || '',
          recipient_pattern: recipientPattern || '',
          has_tag_id: hasTagId,
          add_tag_id: addTagId,
          subject_pattern: subjectPattern || '',
          has_attachments: newRuleHasAttachmentsOnly,
          action_folder: newRuleActionFolder,
          mark_read: newRuleMarkRead,
          enabled: true,
          rule_order: normalizedRuleOrder,
        })
        return
      }
      if (mode.type === 'del') {
        await deleteMailFilterRule(accessToken, effectiveAccountId, mode.id)
        return
      }
      const res = await applyMailFilterRules(accessToken, effectiveAccountId)
      toast.success(`${res.affected} message(s) mis à jour par les règles`)
    },
    onSuccess: (_, mode) => {
      void queryClient.invalidateQueries({ queryKey: ['mail', 'rules', effectiveAccountId] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
      if (mode.type === 'add' || mode.type === 'patch') {
        setNewRuleName('')
        setNewRuleFromPattern('')
        setNewRuleFromDomainPattern('')
        setNewRuleRecipientPattern('')
        setNewRuleHasTagId(null)
        setNewRuleAddTagId(null)
        setNewRuleSubjectPattern('')
        setNewRuleActionFolder('inbox')
        setNewRuleHasAttachmentsOnly(false)
        setNewRuleMarkRead(false)
        setNewRuleOrder('1000')
        setEditingRuleId(null)
        toast.success(mode.type === 'add' ? 'Règle enregistrée' : 'Règle mise à jour')
      } else if (mode.type === 'del') {
        toast.success('Règle supprimée')
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur règles'),
  })

  const mailSearchParsed = useMemo(() => parseMailSearchQuery(mailSearchText), [mailSearchText])
  const mailServerSearchQ = useMemo(() => {
    const j = mailSearchParsed.plainTerms.join(' ').trim()
    if (j.length < 2) return ''
    return j.slice(0, 200)
  }, [mailSearchParsed])

  const isUnifiedFolder = activeFolder === 'unified'
  useEffect(() => {
    if (activeFolder === 'unified' && accounts.length < 2) {
      setActiveFolder('all')
    }
  }, [activeFolder, accounts.length])

  const resetMailFilters = useCallback(() => {
    setMailSearchText('')
    setFilterTagId(null)
    setRecipientAliasFilter(null)
    setConversationThreadKey(null)
    setSimilarSenderFilter(null)
  }, [])
  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: [
      'mail',
      'messages',
      isUnifiedFolder ? 'unified' : effectiveAccountId,
      activeFolder,
      messagePage,
      recipientAliasFilter,
      filterTagId,
      conversationThreadKey,
      mailServerSearchQ,
      mailSearchSort,
    ],
    queryFn: () =>
      isUnifiedFolder
        ? fetchUnifiedMailMessages(accessToken!, {
            limit: MESSAGES_PAGE_SIZE,
            offset: messagePage * MESSAGES_PAGE_SIZE,
            ...(recipientAliasFilter ? { delivered_to: recipientAliasFilter } : {}),
            ...(conversationThreadKey ? { thread_key: conversationThreadKey } : {}),
            ...(mailServerSearchQ ? { q: mailServerSearchQ, sort: mailSearchSort } : {}),
          })
        : fetchMailMessages(accessToken!, effectiveAccountId!, activeFolder, {
            limit: MESSAGES_PAGE_SIZE,
            offset: messagePage * MESSAGES_PAGE_SIZE,
            ...(recipientAliasFilter ? { delivered_to: recipientAliasFilter } : {}),
            ...(filterTagId != null && filterTagId > 0 ? { tag_id: filterTagId } : {}),
            ...(conversationThreadKey ? { thread_key: conversationThreadKey } : {}),
            ...(mailServerSearchQ ? { q: mailServerSearchQ, sort: mailSearchSort } : {}),
          }),
    enabled: !!accessToken && (isUnifiedFolder ? accounts.length > 0 : effectiveAccountId != null),
    refetchOnWindowFocus: true,
  })
  const messages = messagesData?.messages ?? []
  const messagesTotal = messagesData?.total ?? 0

  useEffect(() => {
    setMessagePage(0)
  }, [mailServerSearchQ, mailSearchSort, activeFolder, effectiveAccountId, conversationThreadKey, recipientAliasFilter, filterTagId, isUnifiedFolder])

  const visibleMessages = useMemo(() => {
    const parsed = mailSearchParsed
    const fieldsEnabled = mailSearchSubject || mailSearchSender
    return messages.filter((m) => {
      if (similarSenderFilter) {
        const senderEmail = extractEmailFromSender(m.from)?.toLowerCase() ?? (m.from || '').toLowerCase()
        if (senderEmail !== similarSenderFilter.toLowerCase()) return false
      }
      if (mailSearchUnreadOnly && m.is_read) return false
      if (mailSearchWithAttachmentsOnly && (m.attachment_count ?? 0) <= 0) return false
      if (parsed.unreadOnly && m.is_read) return false
      if (parsed.readOnly && !m.is_read) return false
      if (parsed.withAttachmentsOnly && (m.attachment_count ?? 0) <= 0) return false

      const senderValue = (m.from || '').toLowerCase()
      if (parsed.senderTerms.some((term) => !senderValue.includes(term))) return false
      const subjectValue = (m.subject || '').toLowerCase()
      if (parsed.subjectTerms.some((term) => !subjectValue.includes(term))) return false

      if (parsed.tagTerms.length > 0) {
        const names = (m.tag_ids ?? [])
          .map((id) => mailTags.find((t) => t.id === id)?.name?.toLowerCase() || '')
          .filter(Boolean)
        if (parsed.tagTerms.some((term) => !names.some((n) => n.includes(term)))) return false
      }

      if (!mailServerSearchQ) {
        if (parsed.plainTerms.length === 0) return true
        return parsed.plainTerms.every((term) => {
          const inSubject = (mailSearchSubject || !fieldsEnabled) && subjectValue.includes(term)
          const inSender = (mailSearchSender || !fieldsEnabled) && senderValue.includes(term)
          return inSubject || inSender
        })
      }
      return true
    })
  }, [
    messages,
    mailSearchParsed,
    mailServerSearchQ,
    mailSearchSubject,
    mailSearchSender,
    mailSearchUnreadOnly,
    mailSearchWithAttachmentsOnly,
    similarSenderFilter,
    mailTags,
  ])
  const threadCountByKey = useMemo(() => {
    const byKey = new Map<string, number>()
    for (const m of visibleMessages) {
      const key = (m.thread_key || '').trim() || `msg:${m.id}`
      byKey.set(key, (byKey.get(key) ?? 0) + 1)
    }
    return byKey
  }, [visibleMessages])
  const listMessages = useMemo(() => {
    if (!conversationListMode || conversationThreadKey) return visibleMessages
    const bestByKey = new Map<string, (typeof visibleMessages)[number]>()
    for (const m of visibleMessages) {
      const key = (m.thread_key || '').trim() || `msg:${m.id}`
      const prev = bestByKey.get(key)
      if (!prev) {
        bestByKey.set(key, m)
        continue
      }
      const prevDate = Date.parse(prev.date_at ?? prev.created_at ?? '') || 0
      const curDate = Date.parse(m.date_at ?? m.created_at ?? '') || 0
      if (curDate >= prevDate) bestByKey.set(key, m)
    }
    return Array.from(bestByKey.values())
  }, [visibleMessages, conversationListMode, conversationThreadKey])
  const totalPages = Math.max(1, Math.ceil(messagesTotal / MESSAGES_PAGE_SIZE) || 1)
  const hasNextPage = (messagePage + 1) * MESSAGES_PAGE_SIZE < messagesTotal
  const allMessagesSelectedOnPage = messages.length > 0 && messages.every((m) => selectedMessageIds.includes(m.id))
  const allMessagesSelectedInScope = messagesTotal > 0 && selectedMessageIds.length >= messagesTotal
  /** ID de la boîte en cours de sync manuelle (null = idle). Une seule sync à la fois pour éviter la surcharge IMAP. */
  const [syncingAccountId, setSyncingAccountId] = useState<number | null>(null)
  const [autoSyncRunning, setAutoSyncRunning] = useState(false)
  const lastSyncAtRef = useRef<number>(0)
  const backgroundSyncRunningRef = useRef(false)
  const lastBackgroundSyncStartAtRef = useRef<number>(0)
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
    // Inclure showFullMailHeaders pour relancer un GET quand on active les en-têtes (backfill IMAP côté serveur).
    queryKey: ['mail', 'message', selectedMessageAccountId ?? effectiveAccountId, selectedMessageId, showFullMailHeaders],
    queryFn: () =>
      fetchMailMessage(accessToken!, (selectedMessageAccountId ?? effectiveAccountId)!, selectedMessageId!),
    enabled:
      !!accessToken && (selectedMessageAccountId ?? effectiveAccountId) != null && selectedMessageId != null,
    retry: 8,
    retryDelay: (attempt) => Math.min(12_000, 400 * 2 ** attempt),
  })
  const safeSelectedMessageHtml = useMemo(
    () => sanitizeMailHtmlUnsafeInput(selectedMessageDetail?.body_html || ''),
    [selectedMessageDetail?.body_html]
  )

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
    async (messageId: number, attachmentId: number, filename: string, accountId?: number) => {
      const aid = accountId ?? effectiveAccountId
      if (!accessToken || aid == null) return
      try {
        const blob = await downloadMailAttachment(accessToken, aid, messageId, attachmentId)
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

  const handleImportIcsAttachment = useCallback(
    async (messageId: number, attachmentId: number, filename: string, accountId?: number) => {
      const aid = accountId ?? effectiveAccountId
      if (!accessToken || aid == null) return
      try {
        const blob = await downloadMailAttachment(accessToken, aid, messageId, attachmentId)
        const icsText = await blob.text()
        const event = parseIcsFirstEvent(icsText)
        if (!event) {
          toast.error('Fichier .ics invalide ou sans VEVENT lisible')
          return
        }
        await createCalendarEvent(accessToken, {
          title: event.title,
          start_at: event.startAt,
          end_at: event.endAt,
          location: event.location,
          description: event.description,
        })
        void queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] })
        toast.success(`Événement importé depuis ${filename || '.ics'}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Import calendrier impossible')
      }
    },
    [accessToken, effectiveAccountId, queryClient]
  )

  const mailboxLabelForAccount = useCallback(
    (accountId: number) => {
      const a = accounts.find((x) => x.id === accountId)
      const s = (a?.label?.trim() || a?.email || `Compte ${accountId}`).trim()
      return s.length > 28 ? `${s.slice(0, 26)}…` : s
    },
    [accounts]
  )

  const runMailSyncBatch = useCallback(
    async (accountIds: number[], options?: { force?: boolean }) => {
      if (!accessToken) return false
      if (backgroundSyncRunningRef.current) return false
      const ids = [...new Set(accountIds.filter((id) => id > 0))]
      if (ids.length === 0) return false
      const now = Date.now()
      if (!options?.force && now-lastBackgroundSyncStartAtRef.current < MAIL_AUTO_SYNC_MIN_GAP_MS) return false
      backgroundSyncRunningRef.current = true
      setAutoSyncRunning(true)
      lastBackgroundSyncStartAtRef.current = now
      try {
        const token = await refreshAccessTokenIfNeeded()
        if (!token) return false
        for (const id of ids) {
          const acc = accountsRef.current.find((a) => a.id === id)
          if (!acc) continue
          try {
            const r = await syncMailAccount(token, id, undefined, syncExtraImapOptions(id))
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
        return true
      } finally {
        backgroundSyncRunningRef.current = false
        setAutoSyncRunning(false)
      }
    },
    [accessToken, queryClient, syncExtraImapOptions, refreshAccessTokenIfNeeded]
  )

  useEffect(() => {
    setSelectedMessageId((prev) => (prev == null ? prev : null))
    setSelectedMessageAccountId((prev) => (prev == null ? prev : null))
    setMessagePage((prev) => (prev === 0 ? prev : 0))
    setMailSelectionMode((prev) => (prev ? false : prev))
    setListMsgSelection((prev) =>
      prev.ids.length === 0 && Object.keys(prev.accountById).length === 0 ? prev : { ids: [], accountById: {} }
    )
  }, [effectiveAccountId, activeFolder])

  /** À l'ouverture de la boîte mail (ou au changement de compte), sync IMAP puis rafraîchir la liste. */
  useEffect(() => {
    if (!accessToken || effectiveAccountId == null) return
    let cancelled = false
    void runMailSyncBatch([effectiveAccountId], { force: true }).then(() => {
      if (cancelled) return
    })
    return () => { cancelled = true }
  }, [effectiveAccountId, accessToken, runMailSyncBatch])

  /**
   * Polling IMAP : le backend synchronise **inbox, sent, drafts, spam, trash** (dont corbeille IMAP Gmail/OVH/etc.).
   * Les messages mis en corbeille uniquement depuis l’app restent en `folder=trash` en base ; la sync fusionne avec le dossier Trash IMAP (UID).
   * invalidateQueries(['mail','messages']) invalide toutes les listes React Query ; refetchMessages() met à jour le dossier ouvert.
   */
  useEffect(() => {
    if (!accessToken || accountIdsFingerprint === '') return
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      if (syncingAccountId !== null) return
      await runMailSyncBatch(accountsRef.current.map((a) => a.id))
    }
    const id = window.setInterval(tick, MAIL_BACKGROUND_SYNC_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [accessToken, accountIdsFingerprint, runMailSyncBatch, syncingAccountId])

  /** Au retour sur l'onglet : sync toutes les boîtes si le dernier sync date un peu. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !accessToken) return
      if (Date.now() - lastSyncAtRef.current < MAIL_VISIBILITY_SYNC_MIN_GAP_MS) return
      const list = accountsRef.current
      if (list.length === 0) return
      void runMailSyncBatch(list.map((a) => a.id))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [accessToken, runMailSyncBatch])

  useEffect(() => {
    if (!contextMenuMessage) return
    const close = () => {
      setContextMenuMessage(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    // Bubble (pas capture) : sinon le 2e clic sur « … » ferme puis rouvre le menu avant le handler du bouton.
    const t = window.setTimeout(() => document.addEventListener('click', close, false), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      document.removeEventListener('click', close, false)
    }
  }, [contextMenuMessage])

  const activeSlot = composeSlots.find((s) => s.id === activeComposeId) ?? composeSlots[composeSlots.length - 1] ?? null

  const openNewCompose = useCallback(
    (initial?: { to?: string; subject?: string; body?: string; fromAddress?: string; accountId?: number; title?: string }) => {
      const composeAccountId = initial?.accountId ?? effectiveAccountId
      const primary = accounts.find((a) => a.id === composeAccountId)?.email ?? ''
      const allowedFrom = new Set<string>()
      allowedFrom.add(primary.toLowerCase())
      if (composeAccountId === effectiveAccountId) {
        for (const a of accountAliases) allowedFrom.add(a.alias_email.toLowerCase())
      }
      const maxSlots = typeof window === 'undefined' ? 1 : Math.max(1, Math.floor((window.innerWidth - 40) / 320))
      setComposeSlots((prev) => {
        if (prev.length >= maxSlots) {
          toast.error(`Trop de fenêtres ouvertes pour la largeur actuelle (${maxSlots} max).`)
          return prev
        }
        const wasEmpty = prev.length === 0
        const draft = wasEmpty && composeAccountId != null ? loadDraftLocal(composeAccountId) : null
        let fromAddress = primary
        if (initial?.fromAddress && allowedFrom.has(initial.fromAddress.toLowerCase())) fromAddress = initial.fromAddress
        else if (draft?.fromAddress && allowedFrom.has(draft.fromAddress.toLowerCase())) fromAddress = draft.fromAddress
        const id = `compose-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const slot: ComposeSlot = {
          id,
          title: initial?.title?.trim() || 'Nouveau message',
          fromAddress,
          sendAccountId: initial?.accountId,
          to: initial?.to ?? draft?.to ?? '',
          subject: initial?.subject ?? draft?.subject ?? '',
          body: initial?.body ?? draft?.body ?? '',
          minimized: false,
          attachments: [],
          xOffsetPx: 24 + (prev.length % 5) * 28,
        }
        setActiveComposeId(id)
        if (composeAccountId != null) {
          saveDraftLocal(
            composeAccountId,
            { to: slot.to, subject: slot.subject, body: slot.body, fromAddress: slot.fromAddress },
            { keepEmpty: true }
          )
        }
        return [...prev.map((s) => ({ ...s, minimized: true })), slot]
      })
    },
    [effectiveAccountId, accounts, accountAliases]
  )

  const closeSlot = useCallback(
    (id: string) => {
      const slot = composeSlots.find((s) => s.id === id)
      const draftAcc = slot?.sendAccountId ?? effectiveAccountId
      if (slot && draftAcc != null)
        saveDraftLocal(draftAcc, {
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
  const minimizeComposeSlot = useCallback((id: string) => {
    updateSlot(id, { minimized: true })
  }, [updateSlot])

  const toggleComposeFromChrome = useCallback(() => {
    const target =
      (activeComposeId ? composeSlots.find((s) => s.id === activeComposeId) : null) ??
      composeSlots[composeSlots.length - 1] ??
      null
    if (!target) {
      openNewCompose()
      return
    }
    if (target.minimized) {
      setActiveAndExpand(target.id)
      return
    }
    minimizeComposeSlot(target.id)
  }, [activeComposeId, composeSlots, minimizeComposeSlot, openNewCompose, setActiveAndExpand])

  // Auto-save brouillon du slot actif toutes les 3 s
  useEffect(() => {
    const draftAcc = activeSlot?.sendAccountId ?? effectiveAccountId
    if (!activeSlot || draftAcc == null) return
    const t = setInterval(() => {
      saveDraftLocal(draftAcc, {
        to: activeSlot.to,
        subject: activeSlot.subject,
        body: activeSlot.body,
        fromAddress: activeSlot.fromAddress,
      })
    }, 3000)
    return () => clearInterval(t)
  }, [
    activeSlot?.id,
    activeSlot?.sendAccountId,
    effectiveAccountId,
    activeSlot?.to,
    activeSlot?.subject,
    activeSlot?.body,
    activeSlot?.fromAddress,
  ])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = composeDragRef.current
      if (!drag) return
      const delta = e.clientX - drag.startClientX
      if (Math.abs(delta) > 3) drag.moved = true
      const maxOffset = Math.max(16, window.innerWidth - 340)
      const next = Math.min(maxOffset, Math.max(16, Math.round(drag.startOffset - delta)))
      setComposeSlots((prev) => prev.map((s) => (s.id === drag.id ? { ...s, xOffsetPx: next } : s)))
    }
    const onPointerUp = () => {
      if (composeDragRef.current?.moved) composeDragIgnoreClickRef.current = true
      composeDragRef.current = null
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const activeEl = document.activeElement as HTMLElement | null
      if (activeEl?.closest('[data-compose-slot="true"]')) return
      if (selectedMessageId == null) return
      setSelectedMessageId(null)
      setSelectedMessageAccountId(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedMessageId])

  const onComposeHeaderPointerDown = useCallback((id: string, e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-compose-header-action="true"]')) return
    if (e.button !== 0) return
    const slot = composeSlots.find((s) => s.id === id)
    if (!slot) return
    composeDragRef.current = {
      id,
      startClientX: e.clientX,
      startOffset: slot.xOffsetPx ?? 24,
      moved: false,
    }
  }, [composeSlots])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const activeEl = document.activeElement as HTMLElement | null
      const inCompose = !!activeEl?.closest('[data-compose-slot="true"]')
      if (!inCompose) return
      const target =
        (activeComposeId ? composeSlots.find((s) => s.id === activeComposeId) : null) ??
        composeSlots[composeSlots.length - 1] ??
        null
      if (!target || target.minimized) return
      e.preventDefault()
      minimizeComposeSlot(target.id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeComposeId, composeSlots, minimizeComposeSlot])

  /** Si la boîte ou les alias changent, corriger un « De » devenu invalide. */
  useEffect(() => {
    const primary = accounts.find((a) => a.id === effectiveAccountId)?.email ?? ''
    if (!primary) return
    const allowed = new Set([primary.toLowerCase(), ...accountAliases.map((a) => a.alias_email.toLowerCase())])
    setComposeSlots((prev) => {
      let changed = false
      const next = prev.map((s) => {
        if (allowed.has(s.fromAddress.toLowerCase())) return s
        changed = true
        return { ...s, fromAddress: primary }
      })
      return changed ? next : prev
    })
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
        toast.error('La connexion Google n’est pas encore activée sur ce serveur. Utilisez le menu Mail (icône à côté du fil d’Ariane) puis « Ajouter une boîte » avec un mot de passe d’application Gmail (voir aide).', { duration: 6000 })
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
      const tokenForSync = await refreshAccessTokenIfNeeded()
      if (!tokenForSync) {
        toast.error('Session invalide. Reconnectez-vous.')
        return
      }
      const syncRes = await syncMailAccount(tokenForSync, created.id, password)
      queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
      toast.success(syncRes.synced > 0 ? `${syncRes.synced} message(s) récupéré(s)` : syncRes.message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setConnectingAndSyncing(false)
    }
  }, [connectEmailValue, connectPassword, connectLabel, accessToken, queryClient, notifications, refreshAccessTokenIfNeeded])

  const handleDisconnectAccount = useCallback(
    (accountId: number, email: string) => {
      if (!accessToken) return
      deleteMailAccount(accessToken, accountId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] })
          queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
          void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
          void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
          void queryClient.invalidateQueries({ queryKey: ['mail', 'tags'] })
          void queryClient.invalidateQueries({ queryKey: ['mail', 'aliases'] })
          if (selectedAccountId === accountId) setSelectedAccountId(null)
          toast.success('Boîte retirée.')
          notifications?.addNotification({
            title: 'Boîte retirée',
            message: email,
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
    void (async () => {
      const token = await refreshAccessTokenIfNeeded()
      if (!token) {
        toast.error('Session invalide. Reconnectez-vous.')
        setSyncing(false)
        return
      }
      try {
        const r = await syncMailAccount(token, syncAccountId, syncPassword.trim() || undefined, syncExtraImapOptions(syncAccountId))
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
        toast.success(r.synced > 0 ? `${r.synced} message(s) synchronisé(s)` : r.message)
        setShowSyncModal(false)
        setSyncAccountId(null)
        setSyncPassword('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur de synchronisation')
      } finally {
        setSyncing(false)
      }
    })()
  }, [syncAccountId, syncPassword, accessToken, queryClient, syncExtraImapOptions, refreshAccessTokenIfNeeded])

  /** Sync IMAP pour une boîte donnée (mot de passe serveur déjà stocké si besoin). Rafraîchit les caches de cette boîte. */
  const handleSyncOneAccount = useCallback(
    (accountId: number) => {
      if (!accessToken || syncingAccountId !== null || backgroundSyncRunningRef.current) return
      setSyncingAccountId(accountId)
      void (async () => {
        const token = await refreshAccessTokenIfNeeded()
        if (!token) {
          toast.error('Session invalide. Reconnectez-vous.')
          setSyncingAccountId(null)
          return
        }
        try {
          const r = await syncMailAccount(token, accountId, undefined, syncExtraImapOptions(accountId))
          void queryClient.invalidateQueries({ queryKey: ['mail', 'messages', accountId] })
          void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary', accountId] })
          void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders', accountId] })
          if (accountId === effectiveAccountId) {
            void queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
            void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
            void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
            void refetchMessagesRef.current()
          }
          const acc = accountsRef.current.find((a) => a.id === accountId)
          if (acc) notifyNewMailForAccount(notificationsRef.current, acc, r.synced)
          const label = (acc?.label && acc.label.trim()) || acc?.email || 'Boîte'
          toast.success(r.synced > 0 ? `${label} — ${r.synced} nouveau(x) message(s)` : r.message || 'Synchronisation terminée')
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Erreur lors de la synchronisation')
        } finally {
          setSyncingAccountId(null)
        }
      })()
    },
    [accessToken, syncingAccountId, queryClient, syncExtraImapOptions, effectiveAccountId, refreshAccessTokenIfNeeded]
  )

  /** Synchronisation IMAP manuelle du compte affiché (toutes les boîtes connues + dossiers LIST). */
  const handleRefreshFromServer = useCallback(() => {
    if (!effectiveAccountId) return
    if (syncingAccountId !== null) {
      toast.error('Une synchronisation est déjà en cours. Patientez quelques secondes.')
      return
    }
    handleSyncOneAccount(effectiveAccountId)
  }, [effectiveAccountId, handleSyncOneAccount, syncingAccountId])

  const openCreateImapFolderModal = useCallback((parentImapPath?: string) => {
    setNewImapFolderPathInput('')
    const parent = (parentImapPath ?? '').trim()
    setNewImapFolderParentPath(parent || 'INBOX')
    setNewImapFolderColor('')
    setNewImapFolderIcon('')
    setShowCreateImapFolderModal(true)
  }, [])

  const handleCreateImapFolderFromModal = useCallback(async () => {
    if (!accessToken || effectiveAccountId == null) return
    const raw = newImapFolderPathInput.trim()
    if (!raw) {
      toast.error('Indiquez un nom ou un chemin de dossier')
      return
    }
    const parent = (newImapFolderParentPath || 'INBOX').trim() || 'INBOX'
    setCreatingImapFolder(true)
    try {
      const hasPathSegments = raw.includes('/')
      await createMailImapFolder(accessToken, effectiveAccountId, {
        parent_imap_path: parent,
        ...(hasPathSegments ? { path: raw.replace(/\/+/g, '/').replace(/\/$/, '') } : { label: raw }),
        ui_color: newImapFolderColor.trim(),
        ui_icon: newImapFolderIcon.trim(),
      })
      toast.success('Dossier créé.')
      setShowCreateImapFolderModal(false)
      setNewImapFolderPathInput('')
      void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders', effectiveAccountId] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary', effectiveAccountId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreatingImapFolder(false)
    }
  }, [
    accessToken,
    effectiveAccountId,
    newImapFolderPathInput,
    newImapFolderParentPath,
    newImapFolderColor,
    newImapFolderIcon,
    queryClient,
  ])

  const handleConfirmRenameImapFolder = useCallback(async () => {
    if (!accessToken || effectiveAccountId == null || !imapRenameTarget) return
    const name = imapRenameDraft.trim()
    if (!name) {
      toast.error('Nom requis')
      return
    }
    setImapRenameSaving(true)
    try {
      await renameMailImapFolder(accessToken, effectiveAccountId, {
        imap_path: imapRenameTarget.imap_path,
        new_label: name,
      })
      toast.success('Dossier renommé.')
      setImapRenameTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders', effectiveAccountId] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setImapRenameSaving(false)
    }
  }, [accessToken, effectiveAccountId, imapRenameDraft, imapRenameTarget, queryClient])

  const handleConfirmDeleteImapFolder = useCallback(async () => {
    if (!accessToken || effectiveAccountId == null || !imapDeleteTarget) return
    const deletedPath = imapDeleteTarget.imap_path
    setImapDeleteWorking(true)
    try {
      await deleteMailImapFolder(accessToken, effectiveAccountId, { imap_path: deletedPath })
      toast.success('Dossier supprimé ; les messages ont été déplacés vers la corbeille.')
      setImapDeleteTarget(null)
      if (activeFolder === deletedPath) setActiveFolder('inbox')
      void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders', effectiveAccountId] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'imap-folders'] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary', effectiveAccountId] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setImapDeleteWorking(false)
    }
  }, [accessToken, effectiveAccountId, imapDeleteTarget, activeFolder, queryClient])

  useEffect(() => {
    if (!imapFolderCtx) return undefined
    const close = () => setImapFolderCtx(null)
    const t = window.setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', close)
    }
  }, [imapFolderCtx])

  const [mailReadToggleHighlightId, setMailReadToggleHighlightId] = useState<number | null>(null)
  const mailReadHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (mailReadHighlightTimerRef.current) clearTimeout(mailReadHighlightTimerRef.current)
    }
  }, [])

  const [movingMessageId, setMovingMessageId] = useState<number | null>(null)
  const handleMoveToFolder = useCallback(
    async (messageId: number, folder: MailFolderId, messageAccountId?: number, threadKey?: string | null) => {
      const accId = messageAccountId ?? effectiveAccountId
      if (!accId || !accessToken) return
      setMovingMessageId(messageId)
      try {
        const isConversationAction = conversationListMode && !!threadKey?.trim()
        const conversationIds = isConversationAction
          ? visibleMessages
              .filter((m) => m.account_id === accId && (m.thread_key ?? '') === threadKey)
              .map((m) => m.id)
          : []
        if (conversationIds.length > 1) {
          await moveMailMessagesToFolderBulk(accessToken, accId, conversationIds, folder)
        } else {
          await moveMailMessageToFolder(accessToken, accId, messageId, folder)
        }
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        void runMailSyncBatch([accId], { force: true })
        if (selectedMessageId === messageId) {
          setSelectedMessageId(null)
          setSelectedMessageAccountId(null)
        }
        const label = FOLDERS.find((f) => f.id === folder)?.label ?? folder

        if (conversationIds.length > 1) toast.success(`Conversation déplacée vers ${label}`)
        else toast.success(`Message déplacé vers ${label}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setMovingMessageId(null)
      }
    },
    [effectiveAccountId, accessToken, queryClient, selectedMessageId, conversationListMode, visibleMessages, runMailSyncBatch]
  )

  const handleMarkMessageReadState = useCallback(
    async (messageId: number, accountId: number, read: boolean) => {
      if (!accessToken) return
      try {
        await markMailMessageRead(accessToken, accountId, messageId, read)
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        if (mailReadHighlightTimerRef.current) clearTimeout(mailReadHighlightTimerRef.current)
        setMailReadToggleHighlightId(messageId)
        mailReadHighlightTimerRef.current = setTimeout(() => {
          setMailReadToggleHighlightId(null)
          mailReadHighlightTimerRef.current = null
        }, 2800)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      }
    },
    [accessToken, queryClient]
  )

  const openMailRuleAssistantFromMessage = useCallback(
    (payload: { account_id: number; from?: string; subject?: string; folder?: string }) => {
      const email = extractEmailFromSender(payload.from) || payload.from?.trim() || ''
      const subj = (payload.subject ?? '').trim()
      if (!email && !subj) {
        toast.error('Impossible de préremplir la règle (expéditeur et objet vides).')
        return
      }
      setSelectedAccountId(payload.account_id)
      const subjPat = subj.length > 120 ? `${subj.slice(0, 120)}…` : subj
      setNewRuleFromPattern(email)
      setNewRuleFromDomainPattern(extractDomainFromSender(payload.from))
      setNewRuleRecipientPattern('')
      setNewRuleHasTagId(null)
      setNewRuleAddTagId(null)
      setNewRuleSubjectPattern(subjPat)
      setNewRuleName(
        email
          ? `Depuis ${email}${subjPat ? ` — ${subjPat.slice(0, 48)}${subjPat.length > 48 ? '…' : ''}` : ''}`.slice(0, 120)
          : `Objet : ${subjPat.slice(0, 80)}${subjPat.length > 80 ? '…' : ''}`
      )
      setNewRuleActionFolder(ruleAssistantDefaultActionFolder(payload.folder))
      setNewRuleHasAttachmentsOnly(false)
      setNewRuleMarkRead(false)
        setNewRuleOrder('1000')
      setContextMenuMessage(null)
      setShowMailSettings(true)
      window.setTimeout(() => {
        document.getElementById('mail-settings-filter-rules')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 120)
      toast.success('Règle préremplie : choisissez le dossier cible puis « Ajouter la règle » (ou « Appliquer aux mails existants »).')
    },
    []
  )

  const openMailSettingsAtRules = useCallback(() => {
    setShowMailSettings(true)
    window.setTimeout(() => {
      document.getElementById('mail-settings-filter-rules')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 120)
  }, [])

  const openAddAccountPanel = useCallback(() => {
    setShowConnectEmail(true)
    setMailboxesListExpanded(true)
  }, [])

  const chromeSetters = useAppPageChromeSetters()

  useEffect(() => {
    if (!mailSearchPopoverOpen) return
    const onDocPointerDown = (e: MouseEvent) => {
      if (mailSearchPopoverRef.current && !mailSearchPopoverRef.current.contains(e.target as Node)) {
        setMailSearchPopoverOpen(false)
      }
    }
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMailSearchPopoverOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [mailSearchPopoverOpen])

  const appendSearchToken = useCallback((token: string) => {
    setMailSearchText((prev) => {
      const base = prev.trim()
      if (!base) return token
      return `${base} ${token}`
    })
    requestAnimationFrame(() => {
      const input = mailSearchInputRef.current
      if (!input) return
      input.focus()
      const len = input.value.length
      input.setSelectionRange(len, len)
    })
  }, [])

  const clearMailSearch = useCallback(() => {
    setMailSearchText('')
    setMailSearchPopoverOpen(false)
    setMailSearchUnreadOnly(false)
    setMailSearchWithAttachmentsOnly(false)
    setSimilarSenderFilter(null)
    setConversationThreadKey(null)
    setMessagePage(0)
    requestAnimationFrame(() => {
      const input = mailSearchInputRef.current
      if (!input) return
      input.focus()
    })
  }, [])

  const mailAppChromeBreadcrumb = useMemo(() => {
    if (accounts.length === 0) return null
    return (
      <MailAppChromeMenu
        onNew={toggleComposeFromChrome}
        onRefresh={handleRefreshFromServer}
        onOpenSettings={() => setShowMailSettings(true)}
        onOpenRules={openMailSettingsAtRules}
        onConnectGoogle={handleConnectGoogle}
        onAddAccount={openAddAccountPanel}
        refreshBusy={syncingAccountId !== null && syncingAccountId === effectiveAccountId}
        googleBusy={googleConnecting}
      />
    )
  }, [
    accounts.length,
    toggleComposeFromChrome,
    handleRefreshFromServer,
    openMailSettingsAtRules,
    handleConnectGoogle,
    openAddAccountPanel,
    syncingAccountId,
    effectiveAccountId,
    googleConnecting,
  ])

  const mailAppChromeSearch = useMemo(
    () => (
      <div ref={mailSearchPopoverRef} className="relative w-full min-w-0 flex items-center gap-2">
        <input
          ref={mailSearchInputRef}
          type="text"
          value={mailSearchText}
          onChange={(e) => setMailSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setMailSearchPopoverOpen(false)
              e.currentTarget.blur()
            }
          }}
          onFocus={() => setMailSearchPopoverOpen(true)}
          onClick={() => setMailSearchPopoverOpen(true)}
          placeholder="Mail: from:, subject:, tag:, has:attachment, is:unread"
          className="w-full min-w-[14rem] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 pr-10 text-sm"
        />
        {mailSearchText.trim() ? (
          <button
            type="button"
            onClick={clearMailSearch}
            className="absolute right-[3.15rem] h-7 w-7 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            title="Effacer la recherche"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setConversationListMode((v) => !v)}
          className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium ${
            conversationListMode
              ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20 text-brand-800 dark:text-brand-200'
              : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
          title="Regrouper en conversations (1 ligne par fil)"
        >
          Conversations
        </button>
        {mailSearchPopoverOpen ? (
          <div className="absolute z-30 top-[calc(100%+0.35rem)] left-0 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Filtres rapides</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => appendSearchToken('from:')}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Expéditeur
              </button>
              <button
                type="button"
                onClick={() => appendSearchToken('subject:')}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Objet
              </button>
              <button
                type="button"
                onClick={() => appendSearchToken('is:unread')}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Non lu
              </button>
              <button
                type="button"
                onClick={() => appendSearchToken('has:attachment')}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Pièces jointes
              </button>
              <button
                type="button"
                onClick={() => appendSearchToken('tag:')}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Tag
              </button>
            </div>
          </div>
        ) : null}
      </div>
    ),
    [appendSearchToken, clearMailSearch, conversationListMode, mailSearchPopoverOpen, mailSearchText]
  )

  useEffect(() => {
    if (!chromeSetters) return
    chromeSetters.setBreadcrumbActions(mailAppChromeBreadcrumb)
    return () => {
      chromeSetters.setBreadcrumbActions(null)
    }
  }, [chromeSetters, mailAppChromeBreadcrumb])

  useEffect(() => {
    if (!chromeSetters) return
    chromeSetters.setShellSearchAdjacent(mailAppChromeSearch)
    return () => {
      chromeSetters.setShellSearchAdjacent(null)
    }
  }, [chromeSetters, mailAppChromeSearch])

  const toggleMessageSelected = useCallback((msg: MailMessageResponse) => {
    setListMsgSelection((s) => {
      const has = s.ids.includes(msg.id)
      const ids = has ? s.ids.filter((x) => x !== msg.id) : [...s.ids, msg.id]
      const accountById = { ...s.accountById }
      if (has) delete accountById[msg.id]
      else accountById[msg.id] = msg.account_id
      return { ids, accountById }
    })
  }, [])

  const selectAllMessagesOnPage = useCallback(() => {
    setListMsgSelection((s) => {
      const accountById = { ...s.accountById }
      for (const m of messages) accountById[m.id] = m.account_id
      const idSet = new Set([...s.ids, ...messages.map((m) => m.id)])
      return { ids: [...idSet], accountById }
    })
  }, [messages])

  const clearMessageSelection = useCallback(() => {
    setListMsgSelection({ ids: [], accountById: {} })
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
    if (allMessagesSelectedOnPage) {
      setListMsgSelection((s) => {
        const pageSet = new Set(messages.map((m) => m.id))
        const ids = s.ids.filter((id) => !pageSet.has(id))
        const accountById = { ...s.accountById }
        for (const m of messages) delete accountById[m.id]
        return { ids, accountById }
      })
    } else {
      selectAllMessagesOnPage()
    }
  }, [allMessagesSelectedOnPage, messages, selectAllMessagesOnPage])

  const handleInvertSelectionOnPage = useCallback(() => {
    if (messages.length === 0) return
    const pageIds = messages.map((m) => m.id)
    setListMsgSelection((s) => {
      const prevSet = new Set(s.ids)
      const newIdsOnPage = pageIds.filter((id) => !prevSet.has(id))
      const accountById = { ...s.accountById }
      for (const m of messages) delete accountById[m.id]
      for (const m of messages) {
        if (newIdsOnPage.includes(m.id)) accountById[m.id] = m.account_id
      }
      const other = s.ids.filter((id) => !pageIds.includes(id))
      const ids = [...other, ...newIdsOnPage]
      return { ids, accountById }
    })
  }, [messages])

  const clearSelectionButKeepMode = useCallback(() => {
    setListMsgSelection({ ids: [], accountById: {} })
    setMailSelectionMode(true)
  }, [])

  const handleSelectAllMessagesInScope = useCallback(async () => {
    if (!accessToken) return
    if (!isUnifiedFolder && effectiveAccountId == null) return
    if (messagesTotal <= 0) {
      setListMsgSelection({ ids: [], accountById: {} })
      setMailSelectionMode(false)
      return
    }
    setSelectingAllInScope(true)
    try {
      const seen = new Set<number>()
      const ids: number[] = []
      const accountById: Record<number, number> = {}
      const limit = 250
      let offset = 0
      let total = messagesTotal
      while (offset < total) {
        const page = isUnifiedFolder
          ? await fetchUnifiedMailMessages(accessToken, {
              limit,
              offset,
              ...(recipientAliasFilter ? { delivered_to: recipientAliasFilter } : {}),
              ...(conversationThreadKey ? { thread_key: conversationThreadKey } : {}),
              ...(mailServerSearchQ ? { q: mailServerSearchQ, sort: mailSearchSort } : {}),
            })
          : await fetchMailMessages(accessToken, effectiveAccountId!, activeFolder, {
              limit,
              offset,
              ...(recipientAliasFilter ? { delivered_to: recipientAliasFilter } : {}),
              ...(filterTagId ? { tag_id: filterTagId } : {}),
              ...(conversationThreadKey ? { thread_key: conversationThreadKey } : {}),
              ...(mailServerSearchQ ? { q: mailServerSearchQ, sort: mailSearchSort } : {}),
            })
        total = Math.max(0, page.total)
        if (!Array.isArray(page.messages) || page.messages.length === 0) break
        for (const m of page.messages) {
          if (seen.has(m.id)) continue
          seen.add(m.id)
          ids.push(m.id)
          accountById[m.id] = m.account_id
        }
        offset += page.messages.length
      }
      setListMsgSelection({ ids, accountById })
      setMailSelectionMode(ids.length > 0)
      toast.success(`${ids.length} message(s) sélectionné(s) dans le dossier`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossible de sélectionner tous les messages du dossier')
    } finally {
      setSelectingAllInScope(false)
    }
  }, [
    accessToken,
    isUnifiedFolder,
    effectiveAccountId,
    messagesTotal,
    recipientAliasFilter,
    conversationThreadKey,
    mailServerSearchQ,
    mailSearchSort,
    activeFolder,
    filterTagId,
  ])

  const handleBulkMove = useCallback(
    async (folder: MailFolderId) => {
      if (!accessToken || selectedMessageIds.length === 0) return
      const n = selectedMessageIds.length
      setBulkWorking(true)
      try {
        const byAccount = new Map<number, number[]>()
        for (const id of selectedMessageIds) {
          const aid = selectionAccountByMessageId[id] ?? effectiveAccountId
          if (aid == null) continue
          const arr = byAccount.get(aid) ?? []
          arr.push(id)
          byAccount.set(aid, arr)
        }
        await Promise.all(
          [...byAccount.entries()].map(([aid, ids]) => moveMailMessagesToFolderBulk(accessToken, aid, ids, folder))
        )
        queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        void runMailSyncBatch([...byAccount.keys()], { force: true })
        setListMsgSelection({ ids: [], accountById: {} })
        setSelectedMessageId(null)
        setSelectedMessageAccountId(null)
        const label = FOLDERS.find((f) => f.id === folder)?.label ?? folder
        toast.success(`${n} message(s) déplacé(s) vers ${label}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setBulkWorking(false)
      }
    },
    [effectiveAccountId, accessToken, selectedMessageIds, selectionAccountByMessageId, queryClient, runMailSyncBatch]
  )

  const handleBulkApplyTag = useCallback(
    async (mode: 'add' | 'remove' | 'replace') => {
      if (!accessToken || selectedMessageIds.length === 0 || bulkTagSelection.length === 0) return
      setBulkWorking(true)
      try {
        const byAccount = new Map<number, number[]>()
        for (const id of selectedMessageIds) {
          const aid = selectionAccountByMessageId[id] ?? effectiveAccountId
          if (aid == null) continue
          const arr = byAccount.get(aid) ?? []
          arr.push(id)
          byAccount.set(aid, arr)
        }
        const expandedByAccount = new Map<number, number[]>()
        let targetConversations = 0
        for (const [aid, ids] of byAccount.entries()) {
          const out = new Set(ids)
          if (conversationListMode && !conversationThreadKey) {
            for (const id of ids) {
              const seed = visibleMessages.find((m) => m.id === id && m.account_id === aid)
              const tk = (seed?.thread_key ?? '').trim()
              if (!tk) continue
              for (const m of visibleMessages) {
                if (m.account_id === aid && (m.thread_key ?? '').trim() === tk) out.add(m.id)
              }
            }
          }
          const convKeys = new Set(
            [...out]
              .map((id) => visibleMessages.find((m) => m.id === id && m.account_id === aid)?.thread_key?.trim() || '')
              .filter(Boolean)
          )
          targetConversations += convKeys.size
          expandedByAccount.set(aid, [...out])
        }
        const targetMessages = [...expandedByAccount.values()].reduce((acc, x) => acc + x.length, 0)
        const modeLabel = mode === 'add' ? 'ajouter' : mode === 'remove' ? 'retirer' : 'remplacer'
        const tagsLabel = bulkTagSelection
          .map((id) => mailTags.find((t) => t.id === id)?.name)
          .filter((x): x is string => Boolean(x))
          .join(', ')
        if (
          !window.confirm(
            `Confirmer ${modeLabel} des tags (${tagsLabel || bulkTagSelection.length}) sur ${targetMessages} message(s)` +
              (targetConversations > 0 ? ` / ${targetConversations} conversation(s)` : '') +
              ' ?'
          )
        ) {
          return
        }

        let changed = 0
        for (const [aid, ids] of expandedByAccount.entries()) {
          for (const id of ids) {
            const m = visibleMessages.find((x) => x.id === id && x.account_id === aid)
            const cur = new Set<number>(m?.tag_ids ?? [])
            if (mode === 'replace') {
              cur.clear()
              for (const tid of bulkTagSelection) cur.add(tid)
            } else if (mode === 'add') {
              for (const tid of bulkTagSelection) cur.add(tid)
            } else {
              for (const tid of bulkTagSelection) cur.delete(tid)
            }
            const next = [...cur].sort((a, b) => a - b)
            await putMailMessageTags(accessToken, aid, id, next)
            changed++
          }
        }
        await queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        const actionLabel = mode === 'add' ? 'Étiquette(s) ajoutée(s)' : mode === 'remove' ? 'Étiquette(s) retirée(s)' : 'Étiquettes remplacées'
        toast.success(`${actionLabel} sur ${changed} message(s)`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur étiquettes')
      } finally {
        setBulkWorking(false)
      }
    },
    [
      accessToken,
      selectedMessageIds,
      bulkTagSelection,
      selectionAccountByMessageId,
      effectiveAccountId,
      conversationListMode,
      conversationThreadKey,
      visibleMessages,
      mailTags,
      queryClient,
    ]
  )

  const handleBulkMarkRead = useCallback(
    async (read: boolean) => {
      if (!accessToken || selectedMessageIds.length === 0) return
      setBulkWorking(true)
      try {
        const byAccount = new Map<number, number[]>()
        for (const id of selectedMessageIds) {
          const aid = selectionAccountByMessageId[id] ?? effectiveAccountId
          if (aid == null) continue
          const arr = byAccount.get(aid) ?? []
          arr.push(id)
          byAccount.set(aid, arr)
        }
        await Promise.all(
          [...byAccount.entries()].map(([aid, ids]) => markMailMessagesReadBulk(accessToken, aid, ids, read))
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
    [effectiveAccountId, accessToken, selectedMessageIds, selectionAccountByMessageId, queryClient]
  )

  const handleBulkPermanentDelete = useCallback(async () => {
    if (!accessToken || selectedMessageIds.length === 0) return
    if (activeFolder !== 'trash') {
      toast.error('La suppression définitive est disponible uniquement depuis la corbeille.')
      return
    }
    const n = selectedMessageIds.length
    if (!window.confirm(`Supprimer définitivement ${n} message(s) sélectionné(s) ? Cette action est irréversible.`)) return
    setBulkWorking(true)
    try {
      await Promise.all(
        selectedMessageIds.map((id) => {
          const aid = selectionAccountByMessageId[id] ?? effectiveAccountId
          if (aid == null) return Promise.resolve()
          return deleteMailMessagePermanently(accessToken, aid, id)
        })
      )
      queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
      void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
      setListMsgSelection({ ids: [], accountById: {} })
      setSelectedMessageId(null)
      setSelectedMessageAccountId(null)
      toast.success(`${n} message(s) supprimé(s) définitivement`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBulkWorking(false)
    }
  }, [
    activeFolder,
    accessToken,
    effectiveAccountId,
    queryClient,
    selectedMessageIds,
    selectionAccountByMessageId,
  ])

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
  const isEditingAccountSyncing = editAccountId != null && syncingAccountId === editAccountId

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
        setListMsgSelection((s) => {
          if (s.ids.includes(msg.id)) return s
          return { ids: [...s.ids, msg.id], accountById: { ...s.accountById, [msg.id]: msg.account_id } }
        })
      }, 550)
    },
    [clearMessageLongPressTimer]
  )

  const onMessageListPointerEnd = useCallback(() => {
    clearMessageLongPressTimer()
  }, [clearMessageLongPressTimer])

  useEffect(() => {
    if (!mailSelectionMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearMessageSelection()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mailSelectionMode, clearMessageSelection])

  useEffect(() => {
    if (!similarSenderFilter) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSimilarSenderFilter(null)
      setMessagePage(0)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [similarSenderFilter])

  const handleSelectMessage = useCallback(
    (msg: MailMessageResponse) => {
      if (longPressRef.current.fired) {
        longPressRef.current.fired = false
        return
      }
      if (mailSelectionMode) {
        toggleMessageSelected(msg)
        return
      }
      setSelectedMessageId(msg.id)
      setSelectedMessageAccountId(msg.account_id)
      const senderEmail = extractEmailFromSender(msg.from)
      if (senderEmail) addRecentRecipient(senderEmail)
      if (!msg.is_read && accessToken) {
        markMailMessageRead(accessToken, msg.account_id, msg.id, true)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
            void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
          })
          .catch(() => {})
      }
    },
    [accessToken, mailSelectionMode, queryClient, toggleMessageSelected]
  )

  const selectAdjacentMessageInList = useCallback(
    (delta: number) => {
      if (messages.length === 0) return
      const idx = messages.findIndex((m) => m.id === selectedMessageId)
      if (idx < 0) {
        if (delta > 0) handleSelectMessage(messages[0])
        else handleSelectMessage(messages[messages.length - 1])
        return
      }
      const next = Math.min(messages.length - 1, Math.max(0, idx + delta))
      if (next !== idx) handleSelectMessage(messages[next])
    },
    [messages, selectedMessageId, handleSelectMessage]
  )

  const messageListNavIdx = messages.findIndex((m) => m.id === selectedMessageId)
  const canSelectPrevMessageInList = messages.length > 0 && (messageListNavIdx > 0 || messageListNavIdx < 0)
  const canSelectNextMessageInList = messages.length > 0 && (messageListNavIdx < 0 || messageListNavIdx < messages.length - 1)

  const toggleTagOnMessage = useCallback(
    async (
      messageId: number,
      tagId: number,
      currentIds: number[] | undefined,
      messageAccountId?: number,
      threadKey?: string | null
    ) => {
      const aid = messageAccountId ?? effectiveAccountId
      if (!accessToken || aid == null) return
      const nextSet = new Set(currentIds ?? [])
      if (nextSet.has(tagId)) nextSet.delete(tagId)
      else nextSet.add(tagId)
      const next = Array.from(nextSet).sort((a, b) => a - b)
      try {
        const isConversationAction = conversationListMode && !!threadKey?.trim()
        const conversationIds = isConversationAction
          ? visibleMessages
              .filter((m) => m.account_id === aid && (m.thread_key ?? '') === threadKey)
              .map((m) => m.id)
          : []
        if (conversationIds.length > 1) {
          await Promise.all(conversationIds.map((id) => putMailMessageTags(accessToken, aid, id, next)))
          toast.success('Étiquette appliquée à la conversation')
        } else {
          await putMailMessageTags(accessToken, aid, messageId, next)
        }
        void queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Étiquettes')
      }
    },
    [accessToken, effectiveAccountId, queryClient, conversationListMode, visibleMessages]
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
      accountId: selectedMessageDetail.account_id,
    })
  }, [selectedMessageDetail, openNewCompose])

  const handleReplyAll = useCallback(() => {
    if (!selectedMessageDetail) return
    const toAddrs = (selectedMessageDetail.to || '').split(/,|;/).map((s) => s.trim()).filter(Boolean)
    const from = (selectedMessageDetail.from || '').trim()
    const replyAcc = selectedMessageDetail.account_id
    const me = accounts.find((a) => a.id === replyAcc)?.email
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
      accountId: replyAcc,
    })
  }, [selectedMessageDetail, accounts, openNewCompose])

  const handleForward = useCallback(() => {
    if (!selectedMessageDetail) return
    const subj = selectedMessageDetail.subject || ''
    const sourceHtml = selectedMessageDetail.body_html?.trim() || plainTextToHtml(selectedMessageDetail.body_plain || '')
    const fwd = sourceHtml
      ? `<br><br><hr><p><strong>Message transféré</strong></p><p><strong>De :</strong> ${escapeHtml(selectedMessageDetail.from || '')}<br><strong>À :</strong> ${escapeHtml(selectedMessageDetail.to || '')}<br><strong>Date :</strong> ${escapeHtml(selectedMessageDetail.date_at ? new Date(selectedMessageDetail.date_at).toLocaleString('fr-FR') : '')}<br><strong>Objet :</strong> ${escapeHtml(selectedMessageDetail.subject || '')}</p><blockquote style="margin:0;padding-left:12px;border-left:3px solid #94a3b8;">${sourceHtml}</blockquote>`
      : ''
    openNewCompose({
      to: '',
      subject: subj.startsWith('Fwd:') ? subj : `Fwd: ${subj}`,
      body: fwd,
      accountId: selectedMessageDetail.account_id,
      title: 'Transférer le message',
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
      const sendAcc = slot.sendAccountId ?? effectiveAccountId
      if (!sendAcc || !accessToken) {
        toast.error('Aucun compte mail sélectionné')
        return
      }
      setSending(true)
      try {
        addRecentRecipient(slot.to.trim())
        let body = slot.body
        const sig = getMailSignature()
        if (sig && !body.trim().endsWith(sig.trim())) {
          body = body.trimEnd() + (body.trim() ? '<br><br>' : '') + plainTextToHtml(sig)
        }
        if (slot.attachments.length > 0) {
          body += '<br><br>--- Pièces jointes (Drive) ---<br>'
          slot.attachments.forEach((a) => {
            body += `• ${escapeHtml(a.name)} (${(a.size / 1024).toFixed(1)} Ko) — lien de téléchargement à configurer côté serveur<br>`
          })
        }
        await sendMailMessage(accessToken, {
          account_id: sendAcc,
          to: slot.to.trim(),
          subject: slot.subject,
          body,
          from_email: slot.fromAddress.trim() || undefined,
        })
        toast.success('Message envoyé')
        void runMailSyncBatch([sendAcc], { force: true })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        closeSlot(slot.id)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur d’envoi')
      } finally {
        setSending(false)
      }
    },
    [activeSlot, composeSlots, effectiveAccountId, accessToken, closeSlot, queryClient, runMailSyncBatch]
  )

  const handleScheduleMessage = useCallback(
    async (slotId?: string, scheduledAtOverride?: string) => {
      const slot = slotId ? composeSlots.find((s) => s.id === slotId) : activeSlot
      if (!slot) return
      if (!slot.to.trim()) {
        toast.error('Indiquez un destinataire')
        return
      }
      const sendAcc = slot.sendAccountId ?? effectiveAccountId
      if (!sendAcc || !accessToken) {
        toast.error('Aucun compte mail sélectionné')
        return
      }
      const localDate = new Date(scheduledAtOverride ?? '')
      if (Number.isNaN(localDate.getTime())) {
        toast.error('Date invalide')
        return
      }
      if (localDate.getTime() <= Date.now() + 30_000) {
        toast.error("Choisissez une date d'envoi dans le futur")
        return
      }
      setSending(true)
      try {
        addRecentRecipient(slot.to.trim())
        let body = slot.body
        const sig = getMailSignature()
        if (sig && !body.trim().endsWith(sig.trim())) {
          body = body.trimEnd() + (body.trim() ? '<br><br>' : '') + plainTextToHtml(sig)
        }
        await scheduleMailMessage(accessToken, {
          account_id: sendAcc,
          to: slot.to.trim(),
          subject: slot.subject,
          body,
          from_email: slot.fromAddress.trim() || undefined,
          scheduled_send_at: localDate.toISOString(),
        })
        toast.success('Envoi programmé')
        void queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] })
        void queryClient.invalidateQueries({ queryKey: ['mail', 'folder-summary'] })
        closeSlot(slot.id)
        setScheduleModalForSlotId(null)
        setScheduledLocalDateTime('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur de programmation')
      } finally {
        setSending(false)
      }
    },
    [activeSlot, composeSlots, effectiveAccountId, accessToken, queryClient, closeSlot]
  )

  const openScheduleModal = useCallback((slotId: string) => {
    const defaultLocal = new Date(Date.now() + 60 * 60 * 1000)
    const yyyy = defaultLocal.getFullYear()
    const mm = String(defaultLocal.getMonth() + 1).padStart(2, '0')
    const dd = String(defaultLocal.getDate()).padStart(2, '0')
    const hh = String(defaultLocal.getHours()).padStart(2, '0')
    const mi = String(defaultLocal.getMinutes()).padStart(2, '0')
    setScheduledLocalDateTime(`${yyyy}-${mm}-${dd}T${hh}:${mi}`)
    setScheduleModalForSlotId(slotId)
  }, [])

  const tagMenuAccountMatches = useCallback(
    () => activeFolder !== 'unified' && contextMenuMessage?.account_id === effectiveAccountId,
    [activeFolder, contextMenuMessage?.account_id, effectiveAccountId]
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
    <div className="flex flex-col gap-2 min-h-0 h-full">
      {/* Titre document (a11y + E2E) — aligné sur DrivePage (h1 sr-only) */}
      <h1 className="sr-only">Mail</h1>
      {accounts.length > 0 && !is404 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {effectiveAccountId != null && messages.length > 0 && (mailSelectionMode || selectedMessageIds.length > 0) ? (
            <>
              <span className="hidden md:inline w-px h-6 bg-slate-200 dark:bg-slate-600 shrink-0 mx-0.5" aria-hidden />
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={handleToggleSelectAllOnPage}
                  disabled={bulkWorking || selectingAllInScope}
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
                    disabled={bulkWorking || selectingAllInScope}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    aria-label="Inverser la sélection (page)"
                  >
                    Inverser la sélection
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (allMessagesSelectedInScope) {
                      clearSelectionButKeepMode()
                      return
                    }
                    void handleSelectAllMessagesInScope()
                  }}
                  disabled={bulkWorking || selectingAllInScope}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  aria-label="Tout sélectionner (boîte entière)"
                >
                  {allMessagesSelectedInScope ? <CheckSquare className="h-4 w-4 text-brand-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                  {selectingAllInScope ? 'Sélection complète…' : allMessagesSelectedInScope ? 'Tout désélectionner (boîte)' : 'Tout sélectionner (boîte)'}
                </button>
                <button
                  type="button"
                  onClick={() => clearMessageSelection()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  Terminer
                </button>
                <div className="inline-flex items-center gap-1.5">
                  <div className="relative" ref={bulkTagPickerRef}>
                    <button
                      type="button"
                      onClick={() => setBulkTagPickerOpen((v) => !v)}
                      disabled={bulkWorking}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                      title="Choisir des étiquettes"
                    >
                      Étiquettes ({bulkTagSelection.length})
                    </button>
                    {bulkTagPickerOpen && (
                      <div className="absolute z-20 mt-1 w-56 max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-2 space-y-1">
                        {mailTags.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-1">Aucune étiquette</p>
                        ) : (
                          mailTags.map((t) => {
                            const checked = bulkTagSelection.includes(t.id)
                            return (
                              <label
                                key={t.id}
                                className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setBulkTagSelection((prev) =>
                                      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                                    )
                                  }
                                  className="rounded border-slate-300 dark:border-slate-600"
                                />
                                <span className="truncate">{t.name}</span>
                              </label>
                            )
                          })
                        )}
                        {mailTags.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setBulkTagSelection([])}
                            className="w-full mt-1 text-xs text-slate-500 dark:text-slate-400 hover:underline"
                          >
                            Réinitialiser la sélection
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleBulkApplyTag('add')}
                    disabled={bulkWorking || bulkTagSelection.length === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    title="Ajouter l’étiquette à la sélection"
                  >
                    + Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBulkApplyTag('remove')}
                    disabled={bulkWorking || bulkTagSelection.length === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    title="Retirer l’étiquette de la sélection"
                  >
                    - Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBulkApplyTag('replace')}
                    disabled={bulkWorking || bulkTagSelection.length === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    title="Remplacer les étiquettes de la sélection"
                  >
                    Remplacer tags
                  </button>
                </div>
                {selectedMessageIds.length > 0 ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {selectedMessageIds.length} message(s) sélectionné(s){messagesTotal > 0 ? ` / ${messagesTotal}` : ''}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400 max-w-[20rem]">
                    Cliquez sur l’avatar d’une ligne pour sélectionner (appui long également). La sélection est conservée en changeant de page.
                  </span>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {is404 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4" role="alert">
          <p className="font-medium text-red-800 dark:text-red-200">Le service Mail ne répond pas (404).</p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            En terminal, exécutez : <code className="bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 rounded">make rebuild-mail</code> puis rechargez cette page.
          </p>
        </div>
      )}

      {accountsPending && !is404 && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Chargement des comptes…</span>
        </div>
      )}

      {!accountsPending && !is404 && accounts.length === 0 && (
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col min-h-[260px] flex-1">
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
              {sidebarCollapsed ? (
                <div className="flex flex-col gap-1.5 items-center">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(acc.id)
                        setActiveFolder('inbox')
                        setRecipientAliasFilter(null)
                      }}
                      className={`rounded-lg p-2 w-full flex justify-center ${
                        effectiveAccountId === acc.id
                          ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                      title={acc.label ? `${acc.label} — ${acc.email}` : acc.email}
                    >
                      <Mail className="h-5 w-5" aria-hidden />
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {accounts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setMailboxesListExpanded((v) => !v)}
                      className="w-full flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-800/30 px-2 py-2 text-left text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 mb-1"
                      aria-expanded={mailboxesListExpanded}
                    >
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${mailboxesListExpanded ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        {(() => {
                          const unifiedScope = activeFolder === 'unified' && accounts.length > 1
                          if (unifiedScope) {
                            return (
                              <span className="flex flex-col min-w-0">
                                <span className="truncate font-semibold text-brand-800 dark:text-brand-100">Unifié</span>
                                <span className="truncate text-[10px] text-brand-700 dark:text-brand-300">Toutes les boîtes</span>
                              </span>
                            )
                          }
                          const acc = accounts.find((a) => a.id === effectiveAccountId) ?? accounts[0]
                          if (!acc) return <span className="text-slate-500">—</span>
                          return (
                            <span className="flex flex-col min-w-0">
                              <span className="truncate font-medium">{acc.label?.trim() || acc.email}</span>
                              {acc.label?.trim() ? (
                                <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{acc.email}</span>
                              ) : null}
                            </span>
                          )
                        })()}
                      </span>
                    </button>
                  ) : null}
                  {mailboxesListExpanded && accounts.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {accounts.map((acc) => {
                        const isUnifiedScope = activeFolder === 'unified' && accounts.length > 1
                        const isAccountSelected = !isUnifiedScope && effectiveAccountId === acc.id
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              setSelectedAccountId(acc.id)
                              setActiveFolder('inbox')
                              setRecipientAliasFilter(null)
                              setMailboxesListExpanded(false)
                            }}
                            className={`rounded-lg text-sm font-medium truncate transition-colors min-w-0 w-full text-left px-3 py-2 ${
                              isAccountSelected
                                ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                            }`}
                            title={acc.label ? `${acc.label} — ${acc.email}` : acc.email}
                          >
                            <span className="flex flex-col items-start min-w-0 w-full gap-0.5">
                              <span className="truncate w-full">{acc.label || acc.email}</span>
                              {acc.label ? (
                                <span className="truncate w-full text-[10px] font-normal text-slate-500 dark:text-slate-400">{acc.email}</span>
                              ) : null}
                            </span>
                          </button>
                        )
                      })}
                      {accounts.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFolder('unified')
                            resetMailFilters()
                            setMailboxesListExpanded(false)
                          }}
                          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold transition-colors ${
                            activeFolder === 'unified'
                              ? 'border-brand-500 bg-brand-100 text-brand-900 dark:border-brand-400 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/40 dark:ring-brand-300/40'
                              : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80'
                          }`}
                          title="Courrier de toutes les boîtes (hors corbeille, spam et brouillons)"
                        >
                          <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Unifié
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setShowConnectEmail(true)
                          setMailboxesListExpanded(true)
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-300 dark:border-brand-600 py-2 text-[11px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Ajouter une autre boîte mail
                      </button>
                    </div>
                  ) : null}
                  {effectiveAccountId != null && !sidebarCollapsed ? (
                    <div className="mt-1 ml-1 pl-2 border-l-2 border-slate-200 dark:border-slate-600 space-y-0.5 pb-1">
                      <button
                        type="button"
                        onClick={() => setRecipientAliasFilter(null)}
                          className={`block w-full text-left text-[11px] px-1.5 py-1 rounded ${recipientAliasFilter == null ? 'bg-brand-100/90 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                      >
                        Toutes les adresses
                      </button>
                      {accountAliases.map((al) => (
                        <button
                          key={al.id}
                          type="button"
                          onClick={() => setRecipientAliasFilter(al.alias_email)}
                          className={`block w-full text-left text-[11px] px-1.5 py-1 rounded truncate ${recipientAliasFilter === al.alias_email ? 'bg-brand-100/90 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                        >
                          {al.label?.trim() ? `${al.label} · ${al.alias_email}` : al.alias_email}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            {!sidebarCollapsed && effectiveAccountId != null ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/40 p-2.5 space-y-2">
                {activeFolder !== 'unified' ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Étiquettes</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFilterTagId(null)}
                        className={`text-[11px] rounded-full px-2 py-1 font-medium ${
                          filterTagId == null
                            ? 'bg-brand-100/90 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35'
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
                          className={`text-[11px] rounded-full px-2 py-1 font-medium ${
                            filterTagId === t.id
                              ? 'bg-brand-100/90 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newMailTagName}
                        onChange={(e) => setNewMailTagName(e.target.value)}
                        placeholder="Nouvelle étiquette"
                        className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1"
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
                        className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40 shrink-0"
                      >
                        Créer
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className={`border-t border-slate-200 dark:border-slate-600 pt-2 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between gap-1 px-2 mb-1">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dossiers</p>
                  {effectiveAccountId != null ? (
                    <button
                      type="button"
                      onClick={() => openCreateImapFolderModal()}
                      className="p-1 rounded-md text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 shrink-0"
                      aria-label="Créer un dossier"
                      title="Créer un dossier IMAP"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveFolder('all')
                  resetMailFilters()
                }}
                className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2.5'} ${
                  activeFolder === 'all'
                    ? 'bg-brand-100 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
                title={
                  sidebarCollapsed
                    ? `Tous les dossiers — réception, sous-dossiers, envoyés, archives, dossiers IMAP (sans corbeille, spam ni brouillons).${allMessagesBadgeTotal != null && allMessagesBadgeTotal > 0 ? ` · ${allMessagesBadgeTotal}` : ''}`
                    : 'Vue agrégée : boîte de réception (et sous-dossiers), Envoyés, Archives et autres dossiers IMAP. Exclut corbeille, spam et brouillons — ouvrez-les via les entrées dédiées à gauche.'
                }
              >
                <Layers className="h-4 w-4 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className="flex-1 text-left truncate">
                    Tous les dossiers
                    <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 normal-case tracking-normal">
                      Boîte sélectionnée
                    </span>
                  </span>
                )}
                {!sidebarCollapsed && allMessagesBadgeTotal != null && allMessagesBadgeTotal > 0 ? (
                  <span className="tabular-nums text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/90 dark:bg-slate-600/80 px-1.5 py-0.5 rounded-md min-w-[1.35rem] text-center shrink-0">
                    {allMessagesBadgeTotal > 999 ? '999+' : String(allMessagesBadgeTotal)}
                  </span>
                ) : null}
              </button>
              {FOLDERS.map(({ id, label, icon: Icon }) => {
                const badge = folderSidebarBadge(id, folderSummary, composeSlots.length)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveFolder(id)}
                    className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2.5'} ${
                      activeFolder === id ? 'bg-brand-100 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
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
              {(() => {
                const badge = scheduledFolderSidebarBadge(folderSummary)
                return (
                  <button
                    type="button"
                    onClick={() => setActiveFolder('scheduled')}
                    className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2.5'} ${
                      activeFolder === 'scheduled'
                        ? 'bg-brand-100 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                    title={sidebarCollapsed ? `Programmée${badge ? ` (${badge})` : ''}` : undefined}
                  >
                    <CalendarClock className="h-4 w-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span className="flex-1 text-left truncate">Programmée</span>}
                    {!sidebarCollapsed && badge ? (
                      <span className="tabular-nums text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/90 dark:bg-slate-600/80 px-1.5 py-0.5 rounded-md min-w-[1.35rem] text-center shrink-0">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                )
              })()}
              {!sidebarCollapsed && customImapSidebarRows.length > 0 ? (
                <p className="px-2 mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Autres dossiers (IMAP)
                </p>
              ) : null}
              {customImapSidebarRows.map((row) => {
                const badge = extraFolderSidebarBadge(row.imap_path, folderSummary)
                const delim = row.delimiter || '.'
                const depth = Math.max(0, row.imap_path.split(delim).filter((s) => s.length > 0).length - 2)
                const iconTxt = (row.ui_icon ?? '').trim()
                const colorDot = (row.ui_color ?? '').trim()
                return (
                  <button
                    key={row.imap_path}
                    type="button"
                    onClick={() => setActiveFolder(row.imap_path)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const p = clampMailActionMenuPosition(e.clientX, e.clientY)
                      setImapFolderCtx({ x: p.x, y: p.y, row })
                    }}
                    className={`flex w-full items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'} ${
                      activeFolder === row.imap_path
                        ? 'bg-brand-100 text-brand-900 dark:bg-brand-900/60 dark:text-brand-50 ring-1 ring-inset ring-brand-500/35 dark:ring-brand-300/35'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                    title={sidebarCollapsed ? row.imap_path : undefined}
                  >
                    {iconTxt ? (
                      <span className="shrink-0 w-4 flex justify-center" aria-hidden>
                        {renderMailImapUiIcon(row.ui_icon)}
                      </span>
                    ) : colorDot ? (
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/15"
                        style={{ backgroundColor: colorDot }}
                        aria-hidden
                      />
                    ) : (
                      <FolderOpen className="h-4 w-4 flex-shrink-0 opacity-80" aria-hidden />
                    )}
                    {!sidebarCollapsed && (
                      <span
                        className="flex-1 text-left truncate text-[13px]"
                        style={{ paddingLeft: depth > 0 ? Math.min(16, 6 + depth * 6) : 0 }}
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
            </div>
            <div
              className={`sticky bottom-0 z-10 mt-auto border-t border-slate-200 dark:border-slate-600 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm ${
                sidebarCollapsed ? 'px-0.5 py-1.5' : 'px-1 py-2'
              }`}
            >
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`inline-flex h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${
                      autoSyncRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-500'
                    }`}
                    title={autoSyncRunning ? 'Synchronisation auto en cours' : 'Synchronisation auto au repos'}
                    aria-label={autoSyncRunning ? 'Synchronisation auto en cours' : 'Synchronisation auto au repos'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowMailSettings(true)}
                    className="rounded-lg p-1.5 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                    title="Paramètres Mail"
                    aria-label="Paramètres Mail"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  <div className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-700/60">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10 ${
                          autoSyncRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-500'
                        }`}
                        aria-hidden
                      />
                      {autoSyncRunning ? 'Sync auto en cours…' : 'Sync auto active'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMailSettings(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-500 bg-white/80 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-600"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Paramètres Mail
                  </button>
                </div>
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
            {filterTagId != null && !conversationThreadKey ? (
              <div className="px-4 py-1.5 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800">
                Filtre par étiquette actif (dossier courant).
              </div>
            ) : null}
            {!mailCompactUi && conversationThreadKey ? (
              <div className="px-4 py-2 border-b border-amber-200/70 dark:border-amber-700/60 flex flex-wrap items-center justify-between gap-2 bg-amber-100/80 dark:bg-amber-900/30">
                <span className="text-xs text-amber-900 dark:text-amber-100 inline-flex items-center gap-2">
                  <MessagesSquare className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                  Filtre conversation actif
                </span>
                <button
                  type="button"
                  onClick={() => setConversationThreadKey(null)}
                  className="text-xs font-medium text-amber-900 dark:text-amber-100 hover:underline"
                >
                  Afficher tout le dossier
                </button>
              </div>
            ) : null}
            {!mailCompactUi && similarSenderFilter ? (
              <div className="px-4 py-2 border-b border-blue-200/70 dark:border-blue-700/60 flex flex-wrap items-center justify-between gap-2 bg-blue-100/80 dark:bg-blue-900/35">
                <span className="text-xs text-blue-900 dark:text-blue-100 inline-flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" aria-hidden />
                  Filtre messages similaires actif ({similarSenderFilter})
                </span>
                <button
                  type="button"
                  onClick={() => setSimilarSenderFilter(null)}
                  className="text-xs font-medium text-blue-900 dark:text-blue-100 hover:underline"
                >
                  Afficher tout le dossier
                </button>
              </div>
            ) : null}
            {similarSenderFilter ? (
              <div className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setSimilarSenderFilter(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  title="Annuler le filtre de messages similaires"
                >
                  <X className="h-3.5 w-3.5" />
                  Annuler filtre similaire
                </button>
              </div>
            ) : null}
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                {mailServerSearchQ ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 p-0.5 bg-slate-50/80 dark:bg-slate-900/40">
                    <span className="text-slate-500 dark:text-slate-400 px-1.5">Tri</span>
                    <button
                      type="button"
                      onClick={() => setMailSearchSort('rank')}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        mailSearchSort === 'rank'
                          ? 'bg-brand-600 text-white dark:bg-brand-500'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                      }`}
                    >
                      Pertinence
                    </button>
                    <button
                      type="button"
                      onClick={() => setMailSearchSort('date')}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        mailSearchSort === 'date'
                          ? 'bg-brand-600 text-white dark:bg-brand-500'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                      }`}
                    >
                      Date
                    </button>
                  </span>
                ) : null}
                {mailSearchText.trim() ? (
                  <span className="text-slate-500 dark:text-slate-400">
                    {listMessages.length} résultat(s)
                    {mailServerSearchQ
                      ? ` · ${messagesTotal} au total (recherche)`
                      : ` sur ${listMessages.length} (page)`}
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    Raccourcis: <code>#etiquette</code>, <code>$expediteur</code>, <code>is:unread</code>, <code>has:pj</code>
                  </span>
                )}
              </div>
            </div>
            {messages.length > 0 && selectedMessageIds.length > 0 ? (
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
                        className="rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/35 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" /> Corbeille
                      </button>
                      {activeFolder === 'trash' ? (
                        <button
                          type="button"
                          onClick={() => void handleBulkPermanentDelete()}
                          disabled={bulkWorking}
                          aria-label="Suppression définitive en masse"
                          className="rounded-lg border border-red-400/60 dark:border-red-700 px-3 py-1.5 text-sm font-medium text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-950/45 disabled:opacity-50 flex items-center gap-2"
                        >
                          <Trash2 className="h-4 w-4 shrink-0" /> Supprimer définitivement
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleBulkMove('spam')}
                        disabled={bulkWorking}
                        aria-label="Spam en masse"
                        className="rounded-lg border border-orange-200 dark:border-orange-900/50 px-3 py-1.5 text-sm font-medium text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-50 flex items-center gap-2"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0" /> Spam
                      </button>
                      {(activeFolder === 'all' ||
                        activeFolder === 'unified' ||
                        (activeFolder !== 'archive' && activeFolder !== 'trash')) && (
                        <button
                          type="button"
                          onClick={() => handleBulkMove('archive')}
                          disabled={bulkWorking}
                          aria-label="Archives en masse"
                          className="rounded-lg border border-sky-200 dark:border-sky-800 px-3 py-1.5 text-sm font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 flex items-center gap-2"
                        >
                          <Archive className="h-4 w-4 shrink-0" /> Archives
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
            ) : null}
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
                {listMessages.length > 0 ? (
                  <>
                    <ul className="flex flex-col gap-1.5 px-1 py-2 min-h-0 overflow-y-auto flex-1 overscroll-contain">
                      {listMessages.map((msg) => {
                        const threadKey = (msg.thread_key || '').trim() || `msg:${msg.id}`
                        const threadCount = threadCountByKey.get(threadKey) ?? 1
                        const senderKey = extractEmailFromSender(msg.from)?.toLowerCase()
                        const rowContact = senderKey ? contactsByEmail.get(senderKey) ?? null : null
                        const isUnread = !msg.is_read
                        const isSelected = selectedMessageId === msg.id
                        const isReadToggleFlash = mailReadToggleHighlightId === msg.id
                        const rowSurface = isUnread
                          ? mailUnreadListRowSurface(isSelected)
                          : isSelected
                            ? 'border border-brand-200/90 dark:border-brand-700/45 bg-brand-50 dark:bg-brand-900/25'
                            : 'border border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        const rowFlash = isReadToggleFlash
                          ? 'ring-2 ring-brand-500/80 dark:ring-brand-400/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900 shadow-lg shadow-brand-500/15'
                          : ''
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
                            const p = clampMailActionMenuPosition(e.clientX, e.clientY)
                            setContextMenuMessage({
                              id: msg.id,
                              account_id: msg.account_id,
                              x: p.x,
                              y: p.y,
                              is_read: msg.is_read,
                              from: msg.from,
                              subject: msg.subject,
                              folder: msg.folder,
                              tag_ids: msg.tag_ids,
                              thread_key: msg.thread_key,
                            })
                          }}
                          className={`relative rounded-xl px-4 py-3 transition-[background-color,box-shadow,border-color,ring-color] duration-200 cursor-pointer flex flex-col gap-0.5 group ${rowSurface} ${rowFlash}`}
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
                                  onChange={() => toggleMessageSelected(msg)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                  title="Sélectionner ce message"
                                  aria-label={`Sélectionner le message ${msg.subject || '(Sans objet)'}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setMailSelectionMode(true)
                                    setListMsgSelection((s) => {
                                      if (s.ids.includes(msg.id)) {
                                        const ids = s.ids.filter((x) => x !== msg.id)
                                        const accountById = { ...s.accountById }
                                        delete accountById[msg.id]
                                        return { ids, accountById }
                                      }
                                      return {
                                        ids: [...s.ids, msg.id],
                                        accountById: { ...s.accountById, [msg.id]: msg.account_id },
                                      }
                                    })
                                  }}
                                >
                                  <MailRowAvatar from={msg.from} contact={rowContact} />
                                </button>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <p className={`truncate flex-1 flex items-center gap-1.5 min-w-0 ${msg.is_read ? 'font-medium text-slate-900 dark:text-slate-100' : 'font-semibold text-slate-900 dark:text-slate-100'}`}>
                                  {activeFolder !== 'spam' && (msg.spam_score ?? 0) >= 52 ? (
                                    <span title={`Indésirable probable (score ${msg.spam_score ?? 0}/100) — vérifiez avant d’ouvrir les pièces jointes.`} className="shrink-0 text-amber-600 dark:text-amber-400">
                                      <ShieldAlert className="h-4 w-4" aria-hidden />
                                    </span>
                                  ) : null}
                                  {activeFolder === 'all' ? (
                                    <span
                                      className={`shrink-0 max-w-[9rem] truncate text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                        msg.folder === 'trash'
                                          ? 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                                          : msg.folder === 'spam'
                                            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100'
                                            : 'bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300'
                                      }`}
                                      title={folderDisplayLabel(msg.folder, imapLabelByPath)}
                                    >
                                      {folderDisplayLabel(msg.folder, imapLabelByPath)}
                                    </span>
                                  ) : activeFolder === 'unified' ? (
                                    <span
                                      className="shrink-0 max-w-[10rem] truncate text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-100/90 dark:bg-brand-900/50 text-brand-800 dark:text-brand-100"
                                      title={accounts.find((a) => a.id === msg.account_id)?.email ?? `Compte ${msg.account_id}`}
                                    >
                                      {mailboxLabelForAccount(msg.account_id)}
                                    </span>
                                  ) : null}
                                  <span className="truncate">{msg.subject || '(Sans objet)'}</span>
                                  {msg.tag_ids && msg.tag_ids.length > 0 ? (
                                    <span className="flex shrink-0 gap-0.5" title="Étiquettes">
                                      {msg.tag_ids.map((tid) => {
                                        const t = mailTags.find((x) => x.id === tid)
                                        return t ? (
                                          <span
                                            key={tid}
                                            className="h-2 w-2 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                                            style={{ backgroundColor: t.color || '#64748b' }}
                                            aria-hidden
                                          />
                                        ) : null
                                      })}
                                    </span>
                                  ) : null}
                                  {conversationListMode && threadCount > 1 ? (
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100">
                                      {threadCount} messages
                                    </span>
                                  ) : null}
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
                                    {activeFolder === 'trash' || activeFolder === 'spam'
                                      ? `Date du message : ${formatReceivedDetail(msg.date_at ?? msg.created_at)}`
                                      : `Reçu : ${formatReceivedDetail(msg.date_at ?? msg.created_at)}`}
                                  </p>
                                </div>
                            <div className="flex items-center gap-0.5 shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setContextMenuMessage((prev) => {
                                    if (prev?.id === msg.id) return null
                                    const { x, y } = mailActionMenuPositionBelowButton(rect)
                                    return {
                                      id: msg.id,
                                      account_id: msg.account_id,
                                      x,
                                      y,
                                      is_read: msg.is_read,
                                      from: msg.from,
                                      subject: msg.subject,
                                      folder: msg.folder,
                                      tag_ids: msg.tag_ids,
                                      thread_key: msg.thread_key,
                                    }
                                  })
                                }}
                                className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/90 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 shadow-sm"
                                title="Actions (identique au clic droit)"
                                aria-label="Menu actions message"
                                aria-expanded={contextMenuMessage?.id === msg.id}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {((isStandardMailFolderId(activeFolder) && activeFolder !== 'trash') ||
                                activeFolder === 'all' ||
                                activeFolder === 'unified') && (
                                <>
                                  {showMailArchiveAction(activeFolder, msg.folder) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleMoveToFolder(msg.id, 'archive', msg.account_id, msg.thread_key)}
                                      disabled={movingMessageId === msg.id}
                                      className="p-1.5 rounded-lg border border-sky-200 dark:border-sky-700 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50"
                                      title="Archiver"
                                      aria-label="Archiver"
                                    >
                                      <Archive className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  {showMailTrashAction(activeFolder, msg.folder) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleMoveToFolder(msg.id, 'trash', msg.account_id, msg.thread_key)}
                                      disabled={movingMessageId === msg.id}
                                      className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 disabled:opacity-50"
                                      title="Déplacer vers la corbeille"
                                      aria-label="Corbeille"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  {showMailSpamAction(activeFolder, msg.folder) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleMoveToFolder(msg.id, 'spam', msg.account_id, msg.thread_key)}
                                      disabled={movingMessageId === msg.id}
                                      className="p-1.5 rounded-lg border border-orange-200 dark:border-orange-900/50 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-50"
                                      title="Signaler comme spam"
                                      aria-label="Spam"
                                    >
                                      <AlertTriangle className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </>
                              )}
                              {(activeFolder === 'spam' ||
                                activeFolder === 'trash' ||
                                activeFolder === 'archive' ||
                                ((activeFolder === 'all' || activeFolder === 'unified') &&
                                  showMailRestoreInboxAction(activeFolder, msg.folder))) && (
                                <button
                                  type="button"
                                  onClick={() => handleMoveToFolder(msg.id, 'inbox', msg.account_id, msg.thread_key)}
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
                    <div className="shrink-0 flex flex-col gap-2 border-t border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectAdjacentMessageInList(-1)}
                          disabled={!canSelectPrevMessageInList}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
                          title="Message précédent dans la liste (page courante)"
                          aria-label="Message précédent dans la liste"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden /> Message précédent
                        </button>
                        <button
                          type="button"
                          onClick={() => selectAdjacentMessageInList(1)}
                          disabled={!canSelectNextMessageInList}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
                          title="Message suivant dans la liste (page courante)"
                          aria-label="Message suivant dans la liste"
                        >
                          Message suivant <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => setMessagePage((p) => Math.max(0, p - 1))}
                          disabled={messagePage === 0}
                          className="text-sm text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                          Page précédente
                        </button>
                        <span className="text-xs text-slate-500 dark:text-slate-400 text-center sm:px-2 order-first sm:order-none">
                          Page {messagePage + 1} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMessagePage((p) => p + 1)}
                          disabled={!hasNextPage}
                          className="text-sm text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:no-underline sm:text-right"
                        >
                          Page suivante
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <Mail className="h-12 w-12 text-slate-300 dark:text-slate-500" />
                  <p className="mt-4 text-slate-600 dark:text-slate-300">
                    {messages.length > 0 ? 'Aucun résultat pour cette recherche' : 'Aucun message dans ce dossier'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                    Utilisez « Menu Mail » à côté du fil d’Ariane puis « Actualiser (IMAP) », ou rédigez un message.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button type="button" onClick={() => openNewCompose()} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                      Écrire un message
                    </button>
                    {(mailSearchText.trim() || filterTagId != null || recipientAliasFilter != null || conversationThreadKey || similarSenderFilter) ? (
                      <button type="button" onClick={resetMailFilters} className="text-sm font-medium text-slate-700 dark:text-slate-200 hover:underline">
                        Réinitialiser les filtres
                      </button>
                    ) : null}
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
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMessageId(null)
                            setSelectedMessageAccountId(null)
                          }}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                          aria-label="Fermer"
                        >
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
                          onClick={() => {
                            setSelectedMessageId(null)
                            setSelectedMessageAccountId(null)
                          }}
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
                              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300 dark:border-slate-500 text-brand-600 focus:ring-brand-500"
                                  checked={showFullMailHeaders}
                                  onChange={(e) => {
                                    const on = e.target.checked
                                    setShowFullMailHeaders(on)
                                    saveMailShowFullHeaders(on)
                                  }}
                                />
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  Afficher les en-têtes MIME complets
                                </span>
                              </label>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const rect = e.currentTarget.getBoundingClientRect()
                                const { x, y } = mailActionMenuPositionBelowButton(rect)
                                setContextMenuMessage({
                                  id: selectedMessageDetail.id,
                                  account_id: selectedMessageDetail.account_id,
                                  x,
                                  y,
                                  is_read: selectedMessageDetail.is_read,
                                  from: selectedMessageDetail.from,
                                  subject: selectedMessageDetail.subject,
                                  folder: selectedMessageDetail.folder,
                                  tag_ids: selectedMessageDetail.tag_ids,
                                  thread_key: selectedMessageDetail.thread_key,
                                })
                              }}
                              className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600"
                              title="Actions (identique au clic droit sur la liste)"
                              aria-label="Menu actions message"
                              aria-expanded={contextMenuMessage?.id === selectedMessageDetail.id}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMessageId(null)
                                setSelectedMessageAccountId(null)
                              }}
                              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 border border-transparent hover:border-slate-300 dark:hover:border-slate-600"
                              aria-label="Fermer l’aperçu"
                            >
                              Fermer
                            </button>
                          </div>
                        </div>
                        {showFullMailHeaders ? (
                          <div className="px-4 pb-3 md:px-5 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                              En-têtes bruts (RFC822)
                            </p>
                            {selectedMessageFetching && !selectedMessageDetail.raw_headers?.trim() ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                                Récupération des en-têtes depuis le serveur…
                              </p>
                            ) : selectedMessageDetail.raw_headers?.trim() ? (
                              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-[11px] leading-snug font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                                {selectedMessageDetail.raw_headers
                                  .split('\n')
                                  .map((line, i) => (
                                    <p key={`raw-h-${i}`}>{renderTextWithLinks(line, `raw-h-${i}`)}</p>
                                  ))}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                                  Toujours indisponible ? Vérifiez la migration SQL <code className="text-[10px] not-italic">22-mail-raw-headers.sql</code>, la synchro IMAP et que le message a bien un corps chargé. Réessayez ci-dessous.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void refetchSelectedMessageDetail()}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-500 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                                  Recharger les en-têtes
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
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
                                  <div className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-brand-300 dark:hover:border-brand-600">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDownloadAttachment(
                                          selectedMessageDetail.id,
                                          att.id,
                                          att.filename,
                                          selectedMessageDetail.account_id
                                        )
                                      }
                                      className="flex flex-1 min-w-0 items-center gap-2 text-left"
                                    >
                                      <Download className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                      <span className="flex-1 min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">{att.filename}</span>
                                      <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                                        {att.size_bytes > MAIL_INLINE_ATTACHMENT_MAX_BYTES
                                          ? '≥ 512 Ko'
                                          : `${Math.max(1, Math.round(att.size_bytes / 1024))} Ko`}
                                      </span>
                                    </button>
                                    {(att.filename || '').toLowerCase().endsWith('.ics') ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleImportIcsAttachment(
                                            selectedMessageDetail.id,
                                            att.id,
                                            att.filename,
                                            selectedMessageDetail.account_id
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-700 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/25"
                                        title="Ajouter au calendrier Cloudity"
                                      >
                                        <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                                        Ajouter
                                      </button>
                                    ) : null}
                                  </div>
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
                                  dangerouslySetInnerHTML={{ __html: safeSelectedMessageHtml }}
                                />
                              ) : (
                                <div className="px-5 py-6 md:px-8 md:py-8 text-[0.9375rem] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                                  {selectedMessageDetail.body_plain}
                                </div>
                              )
                            ) : selectedMessagePending || selectedMessageFetching ? (
                              <div className="px-5 py-10 flex flex-col items-center justify-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                                <Loader2 className="h-8 w-8 animate-spin text-brand-500" aria-hidden />
                                <p className="text-center">Récupération du corps du message…</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-sm">
                                  Si le serveur doit aller chercher le message sur IMAP, cela peut prendre quelques secondes.
                                </p>
                              </div>
                            ) : (
                              <div className="px-5 py-8 text-center space-y-3">
                                <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                                  Corps du message indisponible. Réessayez ou lancez une synchronisation depuis « Menu Mail ».
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void refetchSelectedMessageDetail()}
                                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                                  Recharger le message
                                </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" onClick={() => setShowMailSettings(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-lg max-h-[min(90vh,720px)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 border-b border-slate-200 dark:border-slate-600 shrink-0">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Paramètres Mail</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Signature et boîtes reliées.</p>
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
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Mes boîtes mail</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMailSettings(false)
                      setShowConnectEmail(true)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand-300 dark:border-brand-500 bg-brand-100 dark:bg-brand-700 px-2.5 py-1 text-[11px] font-semibold text-brand-900 dark:text-white hover:bg-brand-200 dark:hover:bg-brand-600 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Ajouter une boîte
                  </button>
                </div>
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
                              handleSyncOneAccount(acc.id)
                            }}
                            disabled={syncingAccountId !== null}
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-300 dark:border-brand-500 bg-brand-100 dark:bg-brand-700 px-2.5 py-1.5 text-xs font-medium text-brand-900 dark:text-white hover:bg-brand-200 dark:hover:bg-brand-600 disabled:opacity-40"
                            title="Sync IMAP avec le mot de passe déjà enregistré (sans saisie)"
                          >
                            {syncingAccountId === acc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Sync maintenant
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
                            <KeyRound className="h-3.5 w-3.5" />
                            Sync avec mot de passe…
                          </button>
                          <button
                            type="button"
                            disabled={isMailboxSameAsLoginEmail(acc.email, authLoginEmail)}
                            title={isMailboxSameAsLoginEmail(acc.email, authLoginEmail) ? 'Compte Cloudity' : undefined}
                            onClick={() => {
                              if (
                                window.confirm(`Retirer « ${acc.email} » de Cloudity ? Cette action est définitive.`)
                              ) {
                                handleDisconnectAccount(acc.id, acc.email)
                                setShowMailSettings(false)
                              }
                            }}
                            className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                <Link
                  to="/app/pass"
                  onClick={() => setShowMailSettings(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-brand-400 dark:border-brand-500 bg-brand-700 dark:bg-brand-600 text-white text-xs font-semibold px-3 py-2 hover:bg-brand-800 dark:hover:bg-brand-500"
                >
                  Ouvrir Coffre (Pass)
                </Link>
              </div>

              {effectiveAccountId != null && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Alias</h3>
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
                            → {passAliasTargetLabel(al.deliver_target_email, passVaults)}
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
                            {aliasCibleDraftError ? (
                              <p className="w-full text-[10px] text-red-600 dark:text-red-400">{aliasCibleDraftError}</p>
                            ) : null}
                            <button
                              type="button"
                              className="text-[11px] text-brand-600 dark:text-brand-400 font-medium"
                              disabled={aliasMutation.isPending || !!aliasCibleDraftError}
                              onClick={() =>
                                aliasMutation.mutate({ type: 'patch', id: al.id, deliver_target_email: aliasCibleDraft.trim() })
                              }
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-brand-600 dark:text-brand-400"
                              disabled={aliasTargetVaultId == null || aliasTargetItemId == null}
                              onClick={() => {
                                if (aliasTargetVaultId == null || aliasTargetItemId == null) return
                                setAliasCibleDraft(`pass://vault/${aliasTargetVaultId}/item/${aliasTargetItemId}`)
                              }}
                            >
                              Utiliser Pass
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
                              const target = al.deliver_target_email ?? ''
                              setAliasCibleDraft(target)
                              const parsed = parsePassAliasTarget(target)
                              if (parsed) {
                                setAliasTargetVaultId(parsed.vaultId)
                                setAliasTargetItemId(parsed.itemId)
                              }
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
                    {newAliasDeliverTargetError ? (
                      <p className="text-[10px] text-red-600 dark:text-red-400">{newAliasDeliverTargetError}</p>
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1.5">
                      <select
                        value={aliasTargetVaultId ?? ''}
                        onChange={(e) => {
                          const n = e.target.value ? Number(e.target.value) : null
                          setAliasTargetVaultId(n)
                          setAliasTargetItemId(null)
                        }}
                        className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-[11px]"
                      >
                        <option value="">Choisir un coffre Pass</option>
                        {passVaults.map((v) => (
                          <option key={`alias-pass-v-${v.id}`} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                      <select
                        value={aliasTargetItemId ?? ''}
                        onChange={(e) => setAliasTargetItemId(e.target.value ? Number(e.target.value) : null)}
                        className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-[11px]"
                        disabled={aliasTargetVaultId == null}
                      >
                        <option value="">Entrée Pass</option>
                        {(passVaultItems as PassItemResponse[]).map((it) => (
                          <option key={`alias-pass-item-${it.id}`} value={it.id}>Entrée #{it.id}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={aliasTargetVaultId == null || aliasTargetItemId == null}
                        onClick={() => {
                          if (aliasTargetVaultId == null || aliasTargetItemId == null) return
                          setNewAliasDeliverTarget(`pass://vault/${aliasTargetVaultId}/item/${aliasTargetItemId}`)
                        }}
                        className="rounded border border-brand-300 dark:border-brand-700 px-2 py-1 text-[11px] font-medium text-brand-700 dark:text-brand-300 disabled:opacity-50"
                      >
                        Lier Pass
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={aliasMutation.isPending || !newAliasEmail.trim() || !!newAliasDeliverTargetError}
                      onClick={() => aliasMutation.mutate({ type: 'add' })}
                      className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs px-3 py-1.5 font-medium disabled:opacity-50 w-fit"
                    >
                      Ajouter l’alias
                    </button>
                  </div>
                </div>
              )}

              {effectiveAccountId != null ? (
                <div
                  id="mail-settings-filter-rules"
                  className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-3 space-y-3 scroll-mt-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Règles automatiques (tri)</h3>
                    <button
                      type="button"
                      onClick={() => mailRulesMutation.mutate({ type: 'apply' })}
                      disabled={mailRulesMutation.isPending}
                      className="rounded-lg border border-brand-300 dark:border-brand-700 px-2.5 py-1.5 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 disabled:opacity-50"
                    >
                      Appliquer aux mails existants
                    </button>
                  </div>
                  {safeMailRules.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Aucune règle pour cette boîte.</p>
                  ) : (
                    <ul className="space-y-2 max-h-40 overflow-y-auto">
                      {safeMailRules.map((r) => (
                        <li key={r.id} className="rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">{r.name}</p>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">ordre {r.rule_order ?? 1000}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRuleId(r.id)
                                  setNewRuleName(r.name || 'Règle automatique')
                                  setNewRuleFromPattern(r.from_pattern || '')
                                  setNewRuleFromDomainPattern(r.from_domain_pattern || '')
                                  setNewRuleRecipientPattern(r.recipient_pattern || '')
                                  setNewRuleHasTagId(r.has_tag_id ?? null)
                                  setNewRuleAddTagId(r.add_tag_id ?? null)
                                  setNewRuleSubjectPattern(r.subject_pattern || '')
                                  setNewRuleActionFolder((r.action_folder || 'inbox') as MailFolderId)
                                  setNewRuleHasAttachmentsOnly(Boolean(r.has_attachments))
                                  setNewRuleMarkRead(Boolean(r.mark_read))
                                  setNewRuleOrder(String(r.rule_order ?? 1000))
                                }}
                                disabled={mailRulesMutation.isPending}
                                className="text-[11px] text-brand-600 dark:text-brand-400 disabled:opacity-50"
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                onClick={() => mailRulesMutation.mutate({ type: 'patch', id: r.id, enabledOnly: true })}
                                disabled={mailRulesMutation.isPending}
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border disabled:opacity-50 ${
                                  r.enabled
                                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                                    : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                                }`}
                              >
                                {r.enabled ? 'Désactiver' : 'Activer'}
                              </button>
                              <button
                                type="button"
                                onClick={() => mailRulesMutation.mutate({ type: 'del', id: r.id })}
                                disabled={mailRulesMutation.isPending}
                                className="text-[11px] text-red-600 dark:text-red-400 disabled:opacity-50"
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {[
                              r.from_pattern ? `from contient « ${r.from_pattern} »` : null,
                              r.from_domain_pattern ? `domaine « ${r.from_domain_pattern} »` : null,
                              r.recipient_pattern ? `destinataire « ${r.recipient_pattern} »` : null,
                              r.has_tag_id ? `a l’étiquette #${mailTags.find((t) => t.id === r.has_tag_id)?.name || r.has_tag_id}` : null,
                              r.subject_pattern ? `sujet « ${r.subject_pattern} »` : null,
                              r.has_attachments ? 'avec PJ' : null,
                              r.add_tag_id ? `ajoute #${mailTags.find((t) => t.id === r.add_tag_id)?.name || r.add_tag_id}` : null,
                            ]
                              .filter(Boolean)
                              .join(' ; ') || 'Sans condition texte'}
                            {' → '}
                            dossier « {folderDisplayLabel(r.action_folder, imapLabelByPath)} »{r.mark_read ? ' + marquer lu' : ''}{r.enabled ? '' : ' · désactivée'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Nom de la règle
                      <input
                        type="text"
                        value={newRuleName}
                        onChange={(e) => setNewRuleName(e.target.value)}
                        placeholder="Nom règle (optionnel)"
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Ordre / priorité (0 = prioritaire)
                      <input
                        type="number"
                        min={0}
                        value={newRuleOrder}
                        onChange={(e) => setNewRuleOrder(e.target.value)}
                        placeholder="Ordre"
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Expéditeur contient
                      <input
                        type="text"
                        value={newRuleFromPattern}
                        onChange={(e) => setNewRuleFromPattern(e.target.value)}
                        placeholder="ex: newsletter@"
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">
                      Domaine expéditeur
                      <input
                        type="text"
                        value={newRuleFromDomainPattern}
                        onChange={(e) => setNewRuleFromDomainPattern(e.target.value)}
                        placeholder="ex: example.com"
                        title="Correspond au domaine après @ ; combiné en ET avec « Expéditeur contient »."
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">
                      Destinataire contient
                      <input
                        type="text"
                        value={newRuleRecipientPattern}
                        onChange={(e) => setNewRuleRecipientPattern(e.target.value)}
                        placeholder="ex: compta@ ou @client.fr"
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Sujet contient
                      <input
                        type="text"
                        value={newRuleSubjectPattern}
                        onChange={(e) => setNewRuleSubjectPattern(e.target.value)}
                        placeholder="ex: facture"
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Action : déplacer vers
                      <select
                        value={newRuleActionFolder}
                        onChange={(e) => setNewRuleActionFolder(e.target.value as MailFolderId)}
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      >
                      <optgroup label="Standards">
                        {FOLDERS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                      {customImapSidebarRows.length > 0 ? (
                        <optgroup label="Dossiers IMAP">
                          {customImapSidebarRows.map((row) => (
                            <option key={`rule-imap-${row.imap_path}`} value={row.imap_path}>
                              {row.label?.trim() || row.imap_path}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Condition : étiquette présente
                      <select
                        value={newRuleHasTagId ?? ''}
                        onChange={(e) => setNewRuleHasTagId(e.target.value ? Number(e.target.value) : null)}
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      >
                        <option value="">Aucune</option>
                        {mailTags.map((t) => (
                          <option key={`cond-tag-${t.id}`} value={t.id}>#{t.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Action : ajouter étiquette
                      <select
                        value={newRuleAddTagId ?? ''}
                        onChange={(e) => setNewRuleAddTagId(e.target.value ? Number(e.target.value) : null)}
                        className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                      >
                        <option value="">Aucune</option>
                        {mailTags.map((t) => (
                          <option key={`action-tag-${t.id}`} value={t.id}>#{t.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                    <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 bg-white/70 dark:bg-slate-800/70">
                      <input
                        type="checkbox"
                        checked={newRuleHasAttachmentsOnly}
                        onChange={(e) => setNewRuleHasAttachmentsOnly(e.target.checked)}
                        className="h-4 w-4 accent-brand-600 dark:accent-brand-400"
                      />
                      Uniquement avec PJ
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 bg-white/70 dark:bg-slate-800/70">
                      <input type="checkbox" checked={newRuleMarkRead} onChange={(e) => setNewRuleMarkRead(e.target.checked)} className="h-4 w-4 accent-brand-600 dark:accent-brand-400" />
                      Marquer comme lu
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        mailRulesMutation.mutate(
                          editingRuleId != null ? { type: 'patch', id: editingRuleId } : { type: 'add' }
                        )
                      }
                      disabled={mailRulesMutation.isPending || !canSubmitRule}
                      className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs px-3 py-1.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {editingRuleId != null ? 'Enregistrer les modifications' : 'Ajouter la règle'}
                    </button>
                    {editingRuleId != null ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRuleId(null)
                          setNewRuleName('')
                          setNewRuleFromPattern('')
                          setNewRuleFromDomainPattern('')
                          setNewRuleRecipientPattern('')
                          setNewRuleHasTagId(null)
                          setNewRuleAddTagId(null)
                          setNewRuleSubjectPattern('')
                          setNewRuleActionFolder('inbox')
                          setNewRuleHasAttachmentsOnly(false)
                          setNewRuleMarkRead(false)
                          setNewRuleOrder('1000')
                        }}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                      >
                        Annuler
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
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

      {showCreateImapFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Nouveau dossier</h2>
            <label htmlFor="mail-new-imap-path" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Nom ou chemin
            </label>
            <input
              id="mail-new-imap-path"
              type="text"
              value={newImapFolderPathInput}
              onChange={(e) => setNewImapFolderPathInput(e.target.value)}
              list="mail-imap-folder-path-dl"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 mb-1"
              placeholder="Ex. Factures ou segment/segment (slash pour enchaîner)"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleCreateImapFolderFromModal()
                }
              }}
            />
            <datalist id="mail-imap-folder-path-dl">
              {imapFolderParentOptions.map((r) => (
                <option key={r.imap_path} value={r.imap_path}>
                  {r.label?.trim() || r.imap_path}
                </option>
              ))}
            </datalist>
            {newImapFolderPathSuggestions.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-1">
                {newImapFolderPathSuggestions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="max-w-full truncate rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/80 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
                    title={`Insérer « ${p} » puis « / » pour enchaîner un sous-dossier`}
                    onClick={() =>
                      setNewImapFolderPathInput((cur) => {
                        const t = cur.trim()
                        if (!t) return `${p}/`
                        const join = t.endsWith('/') ? '' : '/'
                        return `${t.replace(/\/+$/, '')}${join}${p}/`
                      })
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : null}
            <label htmlFor="mail-new-imap-parent" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Dossier parent
            </label>
            <input
              id="mail-new-imap-parent"
              type="text"
              value={newImapFolderParentPath}
              onChange={(e) => setNewImapFolderParentPath(e.target.value)}
              list="mail-imap-folder-parent-dl"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 mb-3"
              placeholder="INBOX ou chemin existant"
            />
            <datalist id="mail-imap-folder-parent-dl">
              {imapFolderParentOptions.map((r) => (
                <option key={`p-${r.imap_path}`} value={r.imap_path}>
                  {r.label?.trim() || r.imap_path}
                </option>
              ))}
            </datalist>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label htmlFor="mail-new-imap-color" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Couleur (optionnel)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="mail-new-imap-color-picker"
                    type="color"
                    value={/^#[0-9A-Fa-f]{6}$/.test(newImapFolderColor.trim()) ? newImapFolderColor.trim() : '#3b82f2'}
                    onChange={(e) => setNewImapFolderColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-slate-300 dark:border-slate-600 bg-transparent p-0.5 shrink-0"
                    title="Choisir une couleur"
                    aria-label="Nuancier couleur dossier"
                  />
                  <input
                    id="mail-new-imap-color"
                    type="text"
                    value={newImapFolderColor}
                    onChange={(e) => setNewImapFolderColor(e.target.value)}
                    placeholder="#3b82f2"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <p className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Icône (optionnel)</p>
                <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 p-2 max-h-28 overflow-y-auto">
                  <button
                    type="button"
                    className={`rounded-md p-1.5 text-slate-500 hover:bg-white dark:hover:bg-slate-700 ${newImapFolderIcon === '' ? 'ring-2 ring-brand-500' : ''}`}
                    title="Aucune"
                    aria-label="Sans icône Lucide"
                    onClick={() => setNewImapFolderIcon('')}
                  >
                    <span className="text-[10px] font-medium px-0.5">∅</span>
                  </button>
                  {MAIL_FOLDER_ICON_PICKS.map(({ name, Icon }) => (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      aria-label={name}
                      aria-pressed={newImapFolderIcon === name}
                      onClick={() => setNewImapFolderIcon(name)}
                      className={`rounded-md p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 ${
                        newImapFolderIcon === name ? 'ring-2 ring-brand-500 bg-white dark:bg-slate-700' : ''
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowCreateImapFolderModal(false)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={creatingImapFolder || !newImapFolderPathInput.trim()}
                onClick={() => void handleCreateImapFolderFromModal()}
                className="rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {creatingImapFolder ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {imapFolderCtx ? (
        <div
          className="fixed z-[100] min-w-[12rem] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1 shadow-xl"
          style={{ left: imapFolderCtx.x, top: imapFolderCtx.y }}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!imapSpecialRoleBlocksSubfolderCreation(imapFolderCtx.row.imap_special_use) ? (
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
              onClick={() => {
                openCreateImapFolderModal(imapFolderCtx.row.imap_path)
                setImapFolderCtx(null)
              }}
            >
              Créer un sous-dossier…
            </button>
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Sous-dossier non autorisé pour ce dossier spécial IMAP.</p>
          )}
          {imapFolderCtx.row.user_created ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
                onClick={() => {
                  const lab = imapFolderCtx.row.label?.trim() || imapFolderCtx.row.imap_path
                  setImapRenameTarget({ imap_path: imapFolderCtx.row.imap_path, label: lab })
                  setImapRenameDraft(lab)
                  setImapFolderCtx(null)
                }}
              >
                Renommer…
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-sm text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => {
                  const lab = imapFolderCtx.row.label?.trim() || imapFolderCtx.row.imap_path
                  setImapDeleteTarget({ imap_path: imapFolderCtx.row.imap_path, label: lab })
                  setImapFolderCtx(null)
                }}
              >
                Supprimer…
              </button>
            </>
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Dossier IMAP</p>
          )}
        </div>
      ) : null}

      {imapRenameTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Renommer le dossier</h2>
            <input
              type="text"
              value={imapRenameDraft}
              onChange={(e) => setImapRenameDraft(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleConfirmRenameImapFolder()
                }
              }}
            />
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setImapRenameTarget(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={imapRenameSaving || !imapRenameDraft.trim()}
                onClick={() => void handleConfirmRenameImapFolder()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 inline-flex items-center gap-2"
              >
                {imapRenameSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {imapDeleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Supprimer « {imapDeleteTarget.label} » ?</h2>
            <div className="flex flex-wrap gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setImapDeleteTarget(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={imapDeleteWorking}
                onClick={() => void handleConfirmDeleteImapFolder()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {imapDeleteWorking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showConnectEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto" role="dialog" aria-modal="true" onClick={() => setShowConnectEmail(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6 my-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Ajouter une boîte mail</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Saisissez l’adresse et le mot de passe. Le mot de passe est stocké de façon sécurisée pour la synchronisation (IMAP) et l’envoi (SMTP).
            </p>
            <p className="text-xs text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 rounded-lg px-3 py-2 mb-4">
              <strong>Gmail sans mot de passe d’application :</strong> fermez cette fenêtre et utilisez « Menu Mail » → « Se connecter avec Google » (OAuth). Ce formulaire sert aux boîtes IMAP/SMTP classiques.
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
          data-compose-slot="true"
          className={`fixed right-0 flex flex-col md:left-auto md:right-[var(--compose-right)] md:max-w-2xl md:w-[600px] left-0 md:left-auto ${slot.minimized ? 'rounded-t-xl md:max-h-[52px] max-h-[48px]' : 'left-4 right-4 md:max-h-[85vh] max-h-[90vh] rounded-t-xl'} shadow-2xl border border-b-0 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800`}
          style={{ bottom: index * 52, zIndex: 50 + index, ['--compose-right' as string]: `${slot.xOffsetPx ?? 24}px` }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`compose-title-${slot.id}`}
        >
          <div
            className={`flex items-center border-b border-slate-200 dark:border-slate-600 shrink-0 ${slot.minimized ? 'px-3 py-1.5' : 'px-4 py-2'} cursor-pointer`}
            onPointerDown={(e) => onComposeHeaderPointerDown(slot.id, e)}
            onClick={() => {
              if (composeDragIgnoreClickRef.current) {
                composeDragIgnoreClickRef.current = false
                return
              }
              slot.minimized ? setActiveAndExpand(slot.id) : minimizeComposeSlot(slot.id)
            }}
          >
            <h2 id={`compose-title-${slot.id}`} className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate flex-1">{slot.title || 'Nouveau message'}</h2>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button data-compose-header-action="true" type="button" onClick={() => updateSlot(slot.id, { minimized: !slot.minimized })} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" title={slot.minimized ? 'Agrandir' : 'Réduire en barre'}>
                {slot.minimized ? <Maximize2 className="h-5 w-5" /> : <Minimize2 className="h-5 w-5" />}
              </button>
              <button data-compose-header-action="true" type="button" onClick={() => closeSlot(slot.id)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Fermer">
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
                  <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/30 p-1">
                    <button type="button" onClick={() => document.execCommand('bold')} className="rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700" title="Gras"><Bold className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => document.execCommand('italic')} className="rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700" title="Italique"><Italic className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => document.execCommand('underline')} className="rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700" title="Souligné"><Underline className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => document.execCommand('insertUnorderedList')} className="rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700" title="Liste à puces"><List className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => document.execCommand('insertOrderedList')} className="rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700" title="Liste numérotée"><ListOrdered className="h-3.5 w-3.5" /></button>
                    <button
                      type="button"
                      onClick={() => {
                        const url = window.prompt('URL du lien', 'https://')
                        if (url) document.execCommand('createLink', false, url)
                      }}
                      className="rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                      title="Insérer un lien"
                    ><Link2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div
                    id={`mail-body-${slot.id}`}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => updateSlot(slot.id, { body: e.currentTarget.innerHTML })}
                    dangerouslySetInnerHTML={{ __html: slot.body }}
                    className="min-h-[160px] w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent overflow-auto"
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
                <button type="button" onClick={() => openScheduleModal(slot.id)} disabled={sending} className="px-4 py-2 rounded-lg border border-brand-300 dark:border-brand-500 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-slate-700 disabled:opacity-50">
                  Programmer
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

      {scheduleModalForSlotId && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60"
          role="dialog"
          aria-modal="true"
          onClick={() => setScheduleModalForSlotId(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Programmer l'envoi</h2>
            <p className="text-xs text-slate-700 dark:text-slate-300 mb-3">Choisissez la date et l'heure d'envoi du message.</p>
            <input
              type="datetime-local"
              value={scheduledLocalDateTime}
              onChange={(e) => setScheduledLocalDateTime(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setScheduleModalForSlotId(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!scheduledLocalDateTime || sending}
                onClick={() => void handleScheduleMessage(scheduleModalForSlotId, scheduledLocalDateTime)}
                className="px-3 py-1.5 rounded-lg bg-brand-600 dark:bg-brand-500 text-white disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenuMessage && (
        <div
          className="fixed z-[120] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1 min-w-[220px] max-h-[min(380px,72vh)] overflow-y-auto overscroll-contain"
          style={{ left: contextMenuMessage.x, top: contextMenuMessage.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMailSelectionMode(true)
              setListMsgSelection((s) => {
                if (s.ids.includes(contextMenuMessage.id)) return s
                return {
                  ids: [...s.ids, contextMenuMessage.id],
                  accountById: { ...s.accountById, [contextMenuMessage.id]: contextMenuMessage.account_id },
                }
              })
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
              void handleMarkMessageReadState(
                contextMenuMessage.id,
                contextMenuMessage.account_id,
                !contextMenuMessage.is_read
              )
              setContextMenuMessage(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <MailOpen className="h-4 w-4 shrink-0" />
            {contextMenuMessage.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const sender = extractEmailFromSender(contextMenuMessage.from) || contextMenuMessage.from?.trim() || ''
              if (!sender) {
                toast.error('Expéditeur introuvable pour filtrer')
                setContextMenuMessage(null)
                return
              }
              setSimilarSenderFilter(sender.toLowerCase())
              setContextMenuMessage(null)
              setMessagePage(0)
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Users className="h-4 w-4 shrink-0" /> Filtrer les messages similaires
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openMailRuleAssistantFromMessage({
                account_id: contextMenuMessage.account_id,
                from: contextMenuMessage.from,
                subject: contextMenuMessage.subject,
                folder: contextMenuMessage.folder,
              })
            }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Layers className="h-4 w-4 shrink-0" /> Créer une règle à partir de ce message…
          </button>
          {contextMenuMessage.thread_key ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setConversationThreadKey(contextMenuMessage.thread_key!)
                setContextMenuMessage(null)
                setMessagePage(0)
              }}
              className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <MessagesSquare className="h-4 w-4 shrink-0" /> Voir le fil de conversation
            </button>
          ) : null}
          {showMailArchiveAction(activeFolder, contextMenuMessage.folder) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleMoveToFolder(contextMenuMessage.id, 'archive', contextMenuMessage.account_id, contextMenuMessage.thread_key)
                setContextMenuMessage(null)
              }}
              disabled={movingMessageId === contextMenuMessage.id}
              className="w-full px-3 py-2 text-left text-sm text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 flex items-center gap-2 disabled:opacity-50"
            >
              <Archive className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" /> Vers Archives
            </button>
          )}
          {mailTags.length > 0 && tagMenuAccountMatches() ? (
            <>
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Étiquettes</div>
              {mailTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    void toggleTagOnMessage(
                      contextMenuMessage.id,
                      t.id,
                      contextMenuMessage.tag_ids,
                      contextMenuMessage.account_id,
                      contextMenuMessage.thread_key
                    )
                  }
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <Tag className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className={contextMenuMessage.tag_ids?.includes(t.id) ? 'font-semibold text-brand-700 dark:text-brand-300' : ''}>
                    {contextMenuMessage.tag_ids?.includes(t.id) ? '✓ ' : ''}{t.name}
                  </span>
                </button>
              ))}
            </>
          ) : null}
          {customImapSidebarRows.length > 0 &&
          activeFolder !== 'trash' &&
          activeFolder !== 'unified' &&
          contextMenuMessage.account_id === effectiveAccountId &&
          (activeFolder !== 'all' || showMailTrashAction(activeFolder, contextMenuMessage.folder)) ? (
            <>
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-t border-slate-100 dark:border-slate-600 mt-1">
                Dossiers IMAP
              </div>
              {customImapSidebarRows.slice(0, 14).map((row) => (
                <button
                  key={row.imap_path}
                  type="button"
                  role="menuitem"
                  disabled={movingMessageId === contextMenuMessage.id || contextMenuMessage.folder === row.imap_path}
                  onClick={() => {
                    handleMoveToFolder(contextMenuMessage.id, row.imap_path, contextMenuMessage.account_id, contextMenuMessage.thread_key)
                    setContextMenuMessage(null)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-40"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="truncate">{row.label?.trim() || row.imap_path}</span>
                </button>
              ))}
            </>
          ) : null}
          {((isStandardMailFolderId(activeFolder) && activeFolder !== 'trash') ||
            ((activeFolder === 'all' || activeFolder === 'unified') &&
              showMailTrashAction(activeFolder, contextMenuMessage.folder))) && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  handleMoveToFolder(contextMenuMessage.id, 'trash', contextMenuMessage.account_id, contextMenuMessage.thread_key)
                  setContextMenuMessage(null)
                }}
                disabled={movingMessageId === contextMenuMessage.id}
                className="w-full px-3 py-2 text-left text-sm text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/35 flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" /> Déplacer vers la corbeille
              </button>
              {showMailSpamAction(activeFolder, contextMenuMessage.folder) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleMoveToFolder(contextMenuMessage.id, 'spam', contextMenuMessage.account_id, contextMenuMessage.thread_key)
                    setContextMenuMessage(null)
                  }}
                  disabled={movingMessageId === contextMenuMessage.id}
                  className="w-full px-3 py-2 text-left text-sm text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 flex items-center gap-2 disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" /> Signaler comme spam
                </button>
              )}
            </>
          )}
          {(activeFolder === 'spam' ||
            activeFolder === 'trash' ||
            activeFolder === 'archive' ||
            ((activeFolder === 'all' || activeFolder === 'unified') &&
              showMailRestoreInboxAction(activeFolder, contextMenuMessage.folder))) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleMoveToFolder(contextMenuMessage.id, 'inbox', contextMenuMessage.account_id, contextMenuMessage.thread_key)
                setContextMenuMessage(null)
              }}
              disabled={movingMessageId === contextMenuMessage.id}
              className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50"
            >
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
              {isEditingAccountSyncing ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Synchronisation IMAP en cours pour cette boîte : les champs serveur IMAP/SMTP sont temporairement verrouillés.
                </p>
              ) : null}
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
                      disabled={isEditingAccountSyncing}
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
                      disabled={isEditingAccountSyncing}
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
                      disabled={isEditingAccountSyncing}
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
                      disabled={isEditingAccountSyncing}
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
                  disabled={savingAccount || isEditingAccountSyncing}
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
    </div>
  )
}
