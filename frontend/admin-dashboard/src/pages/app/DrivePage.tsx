import React, { useState, useCallback, useEffect, useLayoutEffect, startTransition, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  HardDrive,
  Folder,
  File,
  FileText,
  Upload,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FolderPlus,
  Trash2,
  Edit2,
  Edit3,
  Download,
  Loader2,
  FolderUp,
  Table,
  Presentation,
  FilePlus,
  Check,
  RotateCcw,
  X,
  LayoutGrid,
  List,
  MoreVertical,
  ArrowLeft,
  Clock,
} from 'lucide-react'
import { useAuth } from '../../authContext'
import { useUpload, DRIVE_FILE_INPUT_ID, DRIVE_FOLDER_INPUT_ID } from '../../uploadContext'
import { formatFileSize } from '../../utils/formatFileSize'
import { formatRelativeDate, formatFullDate, formatRecentGroupLabel, formatRelativeDateWithTime } from '../../utils/formatDate'
import {
  fetchDriveNodes,
  fetchDriveTrash,
  fetchDriveRecentFiles,
  createDriveFolder,
  createDriveFileWithUniqueName,
  putDriveNodeContentBlob,
  renameDriveNode,
  deleteDriveNode,
  restoreDriveNode,
  purgeDriveNode,
  downloadDriveFile,
  downloadDriveFolderAsZip,
  fetchDriveZipEntries,
  downloadDriveArchive,
  getDriveNodeContentAsText,
  moveDriveNode,
  type DriveNode,
  type DriveZipEntry,
} from '../../api'
import { EDITABLE_EXT, getExtension } from '../app/DocumentEditorPage'

const DRIVE_DISPLAY_STORAGE_KEY = 'cloudity_drive_display'

function getStoredDisplayMode(): 'grid' | 'list' {
  if (typeof window === 'undefined') return 'grid'
  const s = localStorage.getItem(DRIVE_DISPLAY_STORAGE_KEY)
  return s === 'list' ? 'list' : 'grid'
}

type BreadcrumbItem = { id: number | null; name: string }

/** Nom affiché pour un fichier (masque l’extension .html). */
function displayFileName(name: string): string {
  if (name.toLowerCase().endsWith('.html')) return name.slice(0, -5)
  return name
}

/** Texte "X dossiers, Y fichiers" pour un dossier (1er niveau). */
function folderContentLabel(node: DriveNode): string {
  const folders = node.child_folders ?? 0
  const files = node.child_files ?? 0
  const total = node.child_count ?? folders + files
  if (total === 0) return '—'
  const parts: string[] = []
  if (folders > 0) parts.push(`${folders} dossier${folders > 1 ? 's' : ''}`)
  if (files > 0) parts.push(`${files} fichier${files > 1 ? 's' : ''}`)
  return parts.join(', ') || '—'
}

/** State passé à l'éditeur pour savoir d'où on vient et où revenir à la fermeture. */
export type EditorFromState = { from: 'drive'; parentId: number | null; breadcrumb: BreadcrumbItem[] } | { from: 'office' }

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
function isImageNode(node: DriveNode): boolean {
  const ext = getExtension(node.name)
  if (IMAGE_EXTENSIONS.includes(ext)) return true
  const mime = (node.mime_type || '').toLowerCase()
  return mime.startsWith('image/')
}

function isPdfNode(node: DriveNode): boolean {
  const ext = getExtension(node.name)
  if (ext === '.pdf') return true
  const mime = (node.mime_type || '').toLowerCase()
  return mime === 'application/pdf'
}

function isZipNode(node: DriveNode): boolean {
  const ext = getExtension(node.name)
  return ext === '.zip' || (node.mime_type || '').toLowerCase() === 'application/zip'
}

/** Fichiers dont on peut afficher le contenu texte dans la preview (sans exécution). */
function isTextPreviewNode(node: DriveNode): boolean {
  const ext = getExtension(node.name)
  const textExt = ['.txt', '.md', '.json', '.xml', '.csv', '.html', '.htm', '.css', '.js', '.ts', '.tsx', '.jsx', '.log']
  if (textExt.includes(ext)) return true
  const mime = (node.mime_type || '').toLowerCase()
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml'
}

/** Affiche le contenu réel du fichier dans la popup preview (image, PDF, texte, liste ZIP). */
function FilePreviewContent({ node, accessToken }: { node: DriveNode; accessToken: string | null }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [zipEntries, setZipEntries] = useState<DriveZipEntry[] | null>(null)
  const [zipStatus, setZipStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const urlRef = React.useRef<string | null>(null)
  useEffect(() => {
    if (!accessToken || node.is_folder) return
    const isImage = isImageNode(node)
    const isPdf = isPdfNode(node)
    const isText = isTextPreviewNode(node)
    if (!isImage && !isPdf && !isText) return
    setStatus('loading')
    let cancelled = false
    if (isImage || isPdf) {
      downloadDriveFile(accessToken, node.id)
        .then((blob) => {
          if (cancelled) return
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          const url = URL.createObjectURL(blob)
          urlRef.current = url
          setBlobUrl(url)
          setStatus('ok')
        })
        .catch(() => { if (!cancelled) setStatus('error') })
    } else {
      getDriveNodeContentAsText(accessToken, node.id)
        .then((text) => {
          if (!cancelled) { setTextContent(text); setStatus('ok') }
        })
        .catch(() => { if (!cancelled) setStatus('error') })
    }
    return () => {
      cancelled = true
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
      setBlobUrl(null)
      setTextContent(null)
    }
  }, [node.id, node.is_folder, accessToken])
  useEffect(() => {
    if (!accessToken || node.is_folder) return
    if (!isZipNode(node)) return
    setZipStatus('loading')
    setZipEntries(null)
    let cancelled = false
    fetchDriveZipEntries(accessToken, node.id)
      .then((entries) => {
        if (!cancelled) { setZipEntries(entries); setZipStatus('ok') }
      })
      .catch(() => { if (!cancelled) setZipStatus('error') })
    return () => { cancelled = true; setZipEntries(null) }
  }, [node.id, accessToken])
  if (status === 'loading') return (<div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden /></div>)
  if (status === 'error') return (<p className="py-4 text-sm text-slate-500 dark:text-slate-400">Impossible de charger l'aperçu.</p>)
  if (isImageNode(node) && blobUrl) return (<div className="mt-4 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 flex items-center justify-center min-h-[200px] max-h-[70vh]"><img src={blobUrl} alt="" className="max-w-full max-h-[70vh] object-contain" /></div>)
  if (isPdfNode(node) && blobUrl) return (<div className="mt-4 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 min-h-[400px] max-h-[70vh]"><iframe title="Aperçu PDF" src={blobUrl} className="w-full h-full min-h-[400px] max-h-[70vh] border-0" /></div>)
  if (isTextPreviewNode(node) && textContent != null) {
    const ext = getExtension(node.name)
    if (['.html', '.htm'].includes(ext)) return (<div className="mt-4 rounded-lg overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 min-h-[200px] max-h-[70vh]"><iframe title="Aperçu HTML" srcDoc={textContent} className="w-full h-full min-h-[200px] max-h-[70vh] border-0" sandbox="allow-same-origin" /></div>)
    return (<div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-4 max-h-[70vh] overflow-auto"><pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words font-mono">{textContent}</pre></div>)
  }
  if (isZipNode(node)) {
    if (zipStatus === 'loading') return (<div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden /></div>)
    if (zipStatus === 'error') return (<p className="py-4 text-sm text-slate-500 dark:text-slate-400">Impossible de lire le contenu de l'archive.</p>)
    if (zipStatus === 'ok' && zipEntries && zipEntries.length > 0) {
      return (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-4 max-h-[70vh] overflow-auto">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Contenu de l'archive ({zipEntries.length} entrée{zipEntries.length !== 1 ? 's' : ''})</p>
          <ul className="text-sm text-slate-800 dark:text-slate-200 space-y-0.5 font-mono">
            {zipEntries.map((e) => (
              <li key={e.path} className="flex items-center gap-2 py-0.5">
                {e.is_dir ? <Folder className="h-4 w-4 text-amber-500 shrink-0" /> : <File className="h-4 w-4 text-slate-400 shrink-0" />}
                <span className="truncate min-w-0" title={e.path}>{e.path}</span>
                {!e.is_dir && <span className="text-slate-500 dark:text-slate-400 shrink-0">{formatFileSize(e.size)}</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Aucune extraction. Utilisez Télécharger pour récupérer l'archive.</p>
        </div>
      )
    }
    if (zipStatus === 'ok' && zipEntries && zipEntries.length === 0) {
      return (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">Archive ZIP vide.</p>
        </div>
      )
    }
  }
  if (status === 'idle' && !isImageNode(node) && !isPdfNode(node) && !isTextPreviewNode(node)) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-6 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">Aperçu non disponible pour ce type de fichier.</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Documents Office (Word, Excel, PowerPoint, ODT, ODS, ODP), tableurs et binaires : utilisez <strong>Ouvrir</strong> ou <strong>Télécharger</strong> ci-dessous.</p>
      </div>
    )
  }
  return null
}

/** Miniature pour la grille : image réelle ou icône. */
function DriveThumbnail({ node, accessToken }: { node: DriveNode; accessToken: string | null }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const urlRef = React.useRef<string | null>(null)
  useEffect(() => {
    if (!node.is_folder && accessToken && isImageNode(node)) {
      let cancelled = false
      downloadDriveFile(accessToken, node.id)
        .then((blob) => {
          if (!cancelled && blob.type.startsWith('image/')) {
            if (urlRef.current) URL.revokeObjectURL(urlRef.current)
            const url = URL.createObjectURL(blob)
            urlRef.current = url
            setObjectUrl(url)
          }
        })
        .catch(() => {})
      return () => {
        cancelled = true
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current)
          urlRef.current = null
        }
        setObjectUrl(null)
      }
    }
    return undefined
  }, [node.id, node.is_folder, accessToken])

  if (node.is_folder) {
    return (
      <div className="w-full h-24 flex items-center justify-center rounded-t-lg bg-amber-50 dark:bg-amber-900/20">
        <Folder className="h-12 w-12 text-amber-500" />
      </div>
    )
  }
  if (objectUrl) {
    return (
      <div className="w-full h-24 overflow-hidden rounded-t-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
        <img src={objectUrl} alt="" className="max-w-full max-h-full object-contain" />
      </div>
    )
  }
  return (
    <div className="w-full h-24 flex items-center justify-center rounded-t-lg bg-slate-100 dark:bg-slate-700">
      <File className="h-12 w-12 text-slate-400" />
    </div>
  )
}

/** Carte Drive pour la vue grille : titre en haut, menu trois points en haut à droite, clic sur la carte = sélection. */
const DriveNodeCard = React.memo(function DriveNodeCard({
  node,
  isSelected,
  onSelectClick,
  onGoTo,
  onPreviewClick,
  onDownload,
  onDelete,
  onStartEdit,
  onRename,
  onCancelEdit,
  onEditingNameChange,
  editingName,
  isEditing,
  isTrashView,
  onRestore,
  onPurge,
  editorLinkState,
  accessToken,
}: {
  node: DriveNode
  isSelected: boolean
  onSelectClick: (e: React.MouseEvent) => void
  onGoTo: (id: number, name: string) => void
  onPreviewClick?: (node: DriveNode) => void
  onDownload: (node: DriveNode) => void
  onDelete: (node: DriveNode) => void
  onStartEdit?: (node: DriveNode) => void
  onRename?: (id: number) => void
  onCancelEdit?: () => void
  onEditingNameChange?: (v: string) => void
  editingName?: string
  isEditing?: boolean
  isTrashView?: boolean
  onRestore?: (node: DriveNode) => void
  onPurge?: (node: DriveNode) => void
  editorLinkState?: EditorFromState
  accessToken: string | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const menuButtonRef = React.useRef<HTMLButtonElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!menuOpen || !menuButtonRef.current) return
    const updatePos = () => {
      if (menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect()
        setMenuPosition({ top: rect.top - 4, right: window.innerWidth - rect.right })
      }
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen) setMenuPosition(null)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && menuButtonRef.current && !menuButtonRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [menuOpen])

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, [data-card-menu]')) return
    if (isEditing) return
    onSelectClick(e)
  }
  const handleCardDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, [data-card-menu]')) return
    if (isEditing) return
    e.preventDefault()
    if (node.is_folder) onGoTo(node.id, node.name)
    else if (onPreviewClick) onPreviewClick(node)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelectClick(e as unknown as React.MouseEvent)
      }}
      className={`rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-500 transition-all flex flex-col min-w-0 cursor-pointer ${isSelected ? 'ring-2 ring-brand-500 bg-brand-50/50 dark:bg-brand-900/20' : ''}`}
    >
      {/* Titre en haut (pleine largeur) */}
      <div className="p-1.5 min-w-0 border-b border-slate-100 dark:border-slate-700">
        {isEditing && onRename && onCancelEdit && onEditingNameChange ? (
          <div className="flex flex-col gap-0.5 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editingName ?? node.name}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename(node.id)
                if (e.key === 'Escape') onCancelEdit()
              }}
              className="rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-xs min-w-0"
              autoFocus
            />
            <div className="flex gap-1">
              <button type="button" onClick={() => onRename(node.id)} className="text-xs text-brand-600 dark:text-brand-400">OK</button>
              <button type="button" onClick={onCancelEdit} className="text-xs text-slate-500">Annuler</button>
            </div>
          </div>
        ) : (
          <p className="font-medium text-slate-900 dark:text-slate-100 truncate text-xs" title={displayFileName(node.name)}>
            {displayFileName(node.name)}
          </p>
        )}
      </div>
      <DriveThumbnail node={node} accessToken={accessToken} />
      {/* Pied de carte : taille, date, et menu trois points intégré */}
      <div className="p-1.5 flex items-center gap-1 min-w-0 border-t border-slate-100 dark:border-slate-700">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {node.is_folder ? folderContentLabel(node) : formatFileSize(node.size)}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">{formatRelativeDateWithTime(node.updated_at)}</p>
        </div>
        <div className="relative shrink-0" ref={menuRef} data-card-menu>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (!menuOpen && menuButtonRef.current) {
                const rect = menuButtonRef.current.getBoundingClientRect()
                setMenuPosition({ top: rect.top - 4, right: window.innerWidth - rect.right })
              }
              setMenuOpen((v) => !v)
            }}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400"
            aria-label="Actions"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && menuPosition != null && ReactDOM.createPortal(
            <div
              className="fixed z-[9999] min-w-[140px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1"
              style={{ top: menuPosition.top, right: menuPosition.right, transform: 'translateY(-100%)' }}
            >
              {!node.is_folder && EDITABLE_EXT.includes(getExtension(node.name)) && editorLinkState && (
                <Link to={`/app/office/editor/${node.id}`} state={editorLinkState} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Edit3 className="h-4 w-4" /> Ouvrir
                </Link>
              )}
              <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(node); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                <Download className="h-4 w-4" /> {node.is_folder ? 'Télécharger (ZIP)' : 'Télécharger'}
              </button>
              {!isTrashView && onStartEdit && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onStartEdit(node); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Edit2 className="h-4 w-4" /> Renommer
                </button>
              )}
              {isTrashView && onRestore && onPurge ? (
                <>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onRestore(node); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <RotateCcw className="h-4 w-4" /> Restaurer
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onPurge(node); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                    <Trash2 className="h-4 w-4" /> Supprimer définitivement
                  </button>
                </>
              ) : (
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(node); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30" title="Déplacer dans la corbeille">
                  <Trash2 className="h-4 w-4" /> Corbeille
                </button>
              )}
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  )
})

/** Ligne tableau Drive — colonnes alignées, sélection style Google (sans case à cocher). En mode corbeille : Restaurer / Supprimer définitivement. */
const DriveNodeRow = React.memo(function DriveNodeRow({
  node,
  isEditing,
  editingName,
  isDropTarget,
  isSelected,
  onSelectClick,
  onGoTo,
  onStartEdit,
  onRename,
  onCancelEdit,
  onEditingNameChange,
  onDownload,
  onDelete,
  onDragStartRow,
  onDragEndRow,
  onDragOverFolder,
  onDragLeaveFolder,
  isTrashView,
  onRestore,
  onPurge,
  editorLinkState,
  onPreviewClick,
}: {
  node: DriveNode
  isEditing: boolean
  editingName: string
  isDropTarget: boolean
  isSelected: boolean
  onSelectClick: (e: React.MouseEvent) => void
  onGoTo: (id: number, name: string) => void
  onStartEdit: (node: DriveNode) => void
  onRename: (id: number) => void
  onCancelEdit: () => void
  onEditingNameChange: (v: string) => void
  onDownload: (node: DriveNode) => void
  onDelete: (node: DriveNode) => void
  onDragStartRow: (node: DriveNode) => void
  onDragEndRow: () => void
  onDragOverFolder: (id: number) => void
  onDragLeaveFolder: (e: React.DragEvent) => void
  isTrashView?: boolean
  onRestore?: (node: DriveNode) => void
  onPurge?: (node: DriveNode) => void
  editorLinkState?: EditorFromState
  onPreviewClick?: (node: DriveNode) => void
}) {
  const rowClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('a, button, input')) return
    if (t.closest('td:first-child')) return
    if (!isTrashView && node.is_folder) {
      onGoTo(node.id, node.name)
    } else if (!node.is_folder && onPreviewClick) {
      onPreviewClick(node)
    } else {
      onSelectClick(e)
    }
  }
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelectClick(e)
  }
  return (
    <tr
      draggable={!isTrashView}
      onClick={rowClick}
      onDragStart={isTrashView ? undefined : (e) => {
        onDragStartRow(node)
        e.dataTransfer?.setData('application/x-cloudity-drive-node', String(node.id))
        e.dataTransfer!.effectAllowed = 'move'
      }}
      onDragEnd={onDragEndRow}
      className={`group border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isSelected ? 'bg-brand-50 dark:bg-brand-900/30' : ''} ${!isTrashView && isDropTarget && node.is_folder ? 'ring-2 ring-brand-400 dark:ring-brand-500 bg-brand-50 dark:bg-brand-900/30' : ''}`}
    >
      <td className="w-10 py-2 pl-3 pr-1 align-middle text-center relative">
        <button
          type="button"
          onClick={handleCheckboxClick}
          className="absolute inset-0 w-full flex items-center justify-center rounded cursor-pointer text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
          title={isSelected ? 'Désélectionner' : 'Sélectionner'}
        >
          {isSelected ? <Check className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden /> : <span className="inline-block w-5 h-5 rounded border border-slate-300 dark:border-slate-500" aria-hidden />}
        </button>
      </td>
      <td className="py-2 px-2 align-middle min-w-0 max-w-[280px]">
        {isEditing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename(node.id)
                if (e.key === 'Escape') onCancelEdit()
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-[120px] rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
              autoFocus
            />
            <button type="button" onClick={(e) => { e.stopPropagation(); onRename(node.id) }} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">OK</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onCancelEdit() }} className="text-sm text-slate-500 hover:underline">Annuler</button>
          </div>
        ) : node.is_folder ? (
          isTrashView ? (
            <span className="flex items-center gap-2 min-w-0 font-medium text-slate-700 dark:text-slate-300">
              <Folder className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <span className="truncate">{displayFileName(node.name)}</span>
            </span>
          ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onGoTo(node.id, node.name) }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOverFolder(node.id) }}
            onDragLeave={onDragLeaveFolder}
            className="flex items-center gap-2 min-w-0 text-left font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <Folder className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <span className="truncate">{displayFileName(node.name)}</span>
          </button>
          )
        ) : (
          <span className="flex items-center gap-2 min-w-0">
            <File className="h-5 w-5 text-slate-400 flex-shrink-0" />
            {EDITABLE_EXT.includes(getExtension(node.name)) ? (
              <Link to={`/app/office/editor/${node.id}`} state={editorLinkState} onClick={(e) => e.stopPropagation()} className="truncate text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                {displayFileName(node.name)}
              </Link>
            ) : (
              <span className="truncate text-slate-700 dark:text-slate-300">{displayFileName(node.name)}</span>
            )}
          </span>
        )}
      </td>
      <td className="py-2 px-2 align-middle text-right text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap w-28">
        {node.is_folder ? folderContentLabel(node) : formatFileSize(node.size)}
      </td>
      <td className="py-2 px-2 align-middle text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap w-32" title={formatFullDate(node.created_at)}>
        {formatRelativeDate(node.created_at)}
      </td>
      <td className="py-2 px-2 align-middle text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap w-32" title={formatFullDate(node.updated_at)}>
        {formatRelativeDateWithTime(node.updated_at)}
      </td>
      <td className="py-2 px-2 align-middle text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap w-32" title={isTrashView && node.deleted_at ? formatFullDate(node.deleted_at) : formatFullDate(node.updated_at)}>
        {isTrashView && node.deleted_at ? formatRelativeDate(node.deleted_at) : formatRelativeDateWithTime(node.updated_at)}
      </td>
      <td className="py-2 pr-3 pl-1 align-middle w-28">
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition justify-end">
            {isTrashView && onRestore && onPurge ? (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); onRestore(node) }} className="p-1.5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600" title="Restaurer"><RotateCcw className="h-4 w-4" /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onPurge(node) }} className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40" title="Supprimer définitivement"><Trash2 className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                {!node.is_folder && EDITABLE_EXT.includes(getExtension(node.name)) && (
                  <Link to={`/app/office/editor/${node.id}`} state={editorLinkState} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600" title="Éditer"><Edit3 className="h-4 w-4" /></Link>
                )}
                <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(node) }} className="p-1.5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600" title={node.is_folder ? 'Télécharger le dossier (ZIP)' : 'Télécharger'}>
                  <Download className="h-4 w-4" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onStartEdit(node) }} className="p-1.5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600" title="Renommer"><Edit2 className="h-4 w-4" /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(node) }} className="p-1.5 rounded text-slate-500 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  )
})

/** Bouton Téléverser avec sous-menu : Fichier(s) ou Dossier(s) (structure conservée). */
const UploadButton = React.memo(function UploadButton() {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [open])
  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
        title="Téléverser des fichiers ou dossiers"
        aria-label="Téléverser"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Upload className="h-4 w-4" />
        <span>Téléverser</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-2 z-20">
          <button
            type="button"
            onClick={() => {
              document.getElementById(DRIVE_FILE_INPUT_ID)?.click()
              setOpen(false)
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Upload className="h-5 w-5 text-slate-500" />
            <span>Un ou plusieurs fichiers</span>
          </button>
          <button
            type="button"
            onClick={() => {
              document.getElementById(DRIVE_FOLDER_INPUT_ID)?.click()
              setOpen(false)
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            title="La structure des dossiers sera conservée"
          >
            <FolderUp className="h-5 w-5 text-slate-500" />
            <span>Un ou plusieurs dossiers</span>
          </button>
        </div>
      )}
    </div>
  )
})

/** Barre d'outils Drive mémoïsée pour ne pas recréer les boutons à chaque re-render (Chromium). */
const DriveToolbar = React.memo(function DriveToolbar({
  viewMode,
  onViewModeChange,
  breadcrumb,
  onBreadcrumbClick,
  onNewFolder,
  onNewDocument,
  onNewTableur,
  onNewPresentation,
  creatingDocument,
  showNewFileMenu,
  onToggleNewFileMenu,
  dropTargetIsRoot,
  onDragOverBreadcrumbRoot,
  onDragLeaveBreadcrumbRoot,
  onDropOnBreadcrumbRoot,
  displayMode,
  onDisplayModeChange,
}: {
  viewMode: 'drive' | 'trash' | 'recent'
  onViewModeChange: (v: 'drive' | 'trash' | 'recent') => void
  breadcrumb: BreadcrumbItem[]
  onBreadcrumbClick: (id: number | null, name: string) => void
  onNewFolder: () => void
  onNewDocument?: () => void
  onNewTableur?: () => void
  onNewPresentation?: () => void
  creatingDocument?: boolean
  showNewFileMenu?: boolean
  onToggleNewFileMenu?: () => void
  dropTargetIsRoot?: boolean
  onDragOverBreadcrumbRoot?: (e: React.DragEvent) => void
  onDragLeaveBreadcrumbRoot?: () => void
  onDropOnBreadcrumbRoot?: (e: React.DragEvent) => void
  displayMode?: 'grid' | 'list'
  onDisplayModeChange?: (v: 'grid' | 'list') => void
}) {
  const showRootDropZone = viewMode === 'drive' && breadcrumb.length > 1 && onDragOverBreadcrumbRoot && onDropOnBreadcrumbRoot
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        {viewMode === 'drive' && (
          <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 flex-wrap" aria-label="Chemin du Drive">
            {showRootDropZone && (
              <span
                role="button"
                tabIndex={0}
                onClick={() => onBreadcrumbClick(null, 'Drive')}
                onDragOver={onDragOverBreadcrumbRoot}
                onDragLeave={onDragLeaveBreadcrumbRoot}
                onDrop={onDropOnBreadcrumbRoot}
                className={`inline-flex items-center rounded px-2 py-0.5 font-medium cursor-pointer select-none ${
                  dropTargetIsRoot
                    ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200 ring-2 ring-brand-400 dark:ring-brand-500'
                    : 'hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                aria-label="Racine — déposer ici pour déplacer à la racine"
              >
                Racine
              </span>
            )}
            {!showRootDropZone && breadcrumb.length <= 1 && (
              <span className="font-medium text-slate-700 dark:text-slate-300">Racine</span>
            )}
            {breadcrumb.length > 1 && (
              <>
                {!showRootDropZone && (
                  <button
                    type="button"
                    onClick={() => onBreadcrumbClick(null, 'Drive')}
                    className="hover:text-slate-900 dark:hover:text-slate-100 font-medium"
                  >
                    Racine
                  </button>
                )}
                {breadcrumb.slice(1).map((b, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                    <button
                      type="button"
                      onClick={() => onBreadcrumbClick(b.id, b.name)}
                      className="hover:text-slate-900 dark:hover:text-slate-100 font-medium"
                    >
                      {b.name}
                    </button>
                  </span>
                ))}
              </>
            )}
          </nav>
        )}
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          {viewMode === 'trash' ? 'Corbeille' : viewMode === 'recent' ? 'Récents' : 'Drive'}
        </h1>
        {viewMode === 'trash' && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Fichiers et dossiers supprimés — restaurez ou supprimez définitivement.
          </p>
        )}
        {viewMode === 'recent' && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Fichiers et dossiers modifiés ou créés récemment (30 derniers jours).
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {viewMode === 'drive' ? (
          <>
          <button
            type="button"
            onClick={() => onViewModeChange('recent')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <Clock className="h-4 w-4" />
            Récents
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('trash')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <Trash2 className="h-4 w-4" />
            Corbeille
          </button>
          </>
        ) : viewMode === 'recent' ? (
          <>
          <button
            type="button"
            onClick={() => onViewModeChange('drive')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au Drive
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('trash')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <Trash2 className="h-4 w-4" />
            Corbeille
          </button>
          </>
        ) : (
          <>
          <button
            type="button"
            onClick={() => onViewModeChange('drive')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au Drive
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('recent')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            <Clock className="h-4 w-4" />
            Récents
          </button>
          </>
        )}
        {viewMode === 'drive' && onDisplayModeChange && (
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-0.5">
            <button
              type="button"
              onClick={() => onDisplayModeChange('grid')}
              className={`p-2 rounded-md ${displayMode === 'grid' ? 'bg-white dark:bg-slate-600 shadow text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              title="Vue grille"
              aria-label="Vue grille"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDisplayModeChange('list')}
              className={`p-2 rounded-md ${displayMode === 'list' ? 'bg-white dark:bg-slate-600 shadow text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              title="Vue liste"
              aria-label="Vue liste"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        )}
        {viewMode === 'drive' && (
          <>
        <UploadButton />
        {(onNewDocument ?? onNewTableur ?? onNewPresentation) && (
          <div className="relative">
            <button
              type="button"
              onClick={onToggleNewFileMenu ?? onNewDocument}
              disabled={creatingDocument}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {creatingDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
              Nouveau fichier
            </button>
            {showNewFileMenu && (onNewDocument ?? onNewTableur ?? onNewPresentation) && (
              <div className="absolute left-0 mt-1 w-56 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-2 z-20">
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Type de fichier
                </p>
                {onNewDocument && (
                  <button
                    type="button"
                    data-testid="drive-new-document"
                    disabled={creatingDocument}
                    onClick={onNewDocument}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    <FileText className="h-5 w-5 text-slate-500" />
                    <span><strong>Document</strong> (éditeur intégré, export .docx)</span>
                  </button>
                )}
                {onNewTableur && (
                  <button
                    type="button"
                    disabled={creatingDocument}
                    onClick={onNewTableur}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Table className="h-5 w-5 text-slate-500" />
                    <span><strong>Tableur</strong> (.csv, export .xlsx)</span>
                  </button>
                )}
                {onNewPresentation && (
                  <button
                    type="button"
                    disabled={creatingDocument}
                    onClick={onNewPresentation}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Presentation className="h-5 w-5 text-slate-500" />
                    <span><strong>Présentation</strong></span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onNewFolder}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600"
        >
          <FolderPlus className="h-4 w-4" />
          Nouveau dossier
        </button>
          </>
        )}
      </div>
    </div>
  )
})

type DriveLocationState = { folderId?: number | null; breadcrumb?: BreadcrumbItem[] }

export default function DrivePage() {
  const { accessToken, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { addUpload, addFolderUpload, setDriveParentId } = useUpload()
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'Drive' }])
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [creatingDocument, setCreatingDocument] = useState(false)
  const [showNewFileMenu, setShowNewFileMenu] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null)
  const [dropTargetIsRoot, setDropTargetIsRoot] = useState(false)
  const [draggedNode, setDraggedNode] = useState<DriveNode | null>(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const [listReady, setListReady] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'created_at' | 'updated_at'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [searchParams, setSearchParams] = useSearchParams()
  const viewFromUrl = searchParams.get('view') === 'trash' ? 'trash' : searchParams.get('view') === 'recent' ? 'recent' : 'drive'
  const [viewMode, setViewModeState] = useState<'drive' | 'trash' | 'recent'>(viewFromUrl)
  const setViewMode = useCallback((mode: 'drive' | 'trash' | 'recent') => {
    setViewModeState(mode)
    setSearchParams(mode === 'trash' ? { view: 'trash' } : mode === 'recent' ? { view: 'recent' } : {}, { replace: true })
  }, [setSearchParams])
  useEffect(() => {
    setViewModeState(viewFromUrl)
  }, [viewFromUrl])
  type DeleteModalTarget = { type: 'single'; node: DriveNode } | { type: 'bulk'; ids: number[] } | null
  const [deleteModalTarget, setDeleteModalTarget] = useState<DeleteModalTarget>(null)
  const [purgeModalTarget, setPurgeModalTarget] = useState<DriveNode | null>(null)
  const [previewNode, setPreviewNode] = useState<DriveNode | null>(null)
  const [displayMode, setDisplayModeState] = useState<'grid' | 'list'>(getStoredDisplayMode)
  const setDisplayMode = useCallback((mode: 'grid' | 'list') => {
    setDisplayModeState(mode)
    try {
      localStorage.setItem(DRIVE_DISPLAY_STORAGE_KEY, mode)
    } catch (_) { /* ignore */ }
  }, [])
  const loadMoreSentinelRef = React.useRef<HTMLDivElement | null>(null)

  const currentParentId = breadcrumb.length > 1 ? (breadcrumb[breadcrumb.length - 1].id as number) : null

  // Au retour depuis l'éditeur : restaurer le dossier (breadcrumb) et effacer le state
  useEffect(() => {
    const state = location.state as DriveLocationState | null | undefined
    if (state?.breadcrumb && Array.isArray(state.breadcrumb) && state.breadcrumb.length > 0) {
      setBreadcrumb(state.breadcrumb)
      navigate('/app/drive', { replace: true, state: {} })
    }
  }, [location.state, navigate])

  useEffect(() => {
    setDriveParentId(currentParentId)
    return () => setDriveParentId(null)
  }, [currentParentId, setDriveParentId])

  const { data, isLoading, error } = useQuery({
    queryKey: ['drive', 'nodes', currentParentId],
    queryFn: () => fetchDriveNodes(accessToken!, currentParentId),
    enabled: Boolean(accessToken) && viewMode === 'drive',
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 2 * 60 * 1000,
  })
  const { data: trashData } = useQuery({
    queryKey: ['drive', 'trash'],
    queryFn: () => fetchDriveTrash(accessToken!),
    enabled: Boolean(accessToken) && viewMode === 'trash',
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const { data: recentNodes = [] } = useQuery({
    queryKey: ['drive', 'recent'],
    queryFn: () => fetchDriveRecentFiles(accessToken!, 12),
    enabled: Boolean(accessToken) && viewMode === 'drive' && currentParentId == null,
    staleTime: 60 * 1000,
  })
  const { data: recentNodesFull = [], isLoading: isRecentFullLoading } = useQuery({
    queryKey: ['drive', 'recent', 'full'],
    queryFn: () => fetchDriveRecentFiles(accessToken!, 100),
    enabled: Boolean(accessToken) && viewMode === 'recent',
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 60 * 1000,
  })
  const [recentSectionVisible, setRecentSectionVisible] = useState(() => {
    try { return localStorage.getItem('cloudity_drive_recent_visible') !== 'false' } catch { return true }
  })
  const toggleRecentSection = useCallback(() => {
    setRecentSectionVisible((prev) => {
      const next = !prev
      try { localStorage.setItem('cloudity_drive_recent_visible', String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.getTime()
  }, [])
  const recentGroupedByDay = useMemo(() => {
    const list = recentNodesFull.filter((n) => (n.updated_at ? new Date(n.updated_at).getTime() : 0) >= thirtyDaysAgo)
    list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    const groupOrder = ["Aujourd'hui", 'Hier', 'Cette semaine']
    const byLabel = new Map<string, typeof list>()
    for (const node of list) {
      const label = formatRecentGroupLabel(node.updated_at)
      if (!byLabel.has(label)) byLabel.set(label, [])
      byLabel.get(label)!.push(node)
    }
    const otherLabels = Array.from(byLabel.keys()).filter((l) => !groupOrder.includes(l))
    otherLabels.sort((a, b) => {
      const dateA = byLabel.get(a)?.[0]?.updated_at
      const dateB = byLabel.get(b)?.[0]?.updated_at
      return (dateB || '').localeCompare(dateA || '')
    })
    const orderedLabels = [...groupOrder.filter((l) => byLabel.has(l)), ...otherLabels]
    return orderedLabels.map((label) => ({ label, nodes: byLabel.get(label) ?? [] })).filter((g) => g.nodes.length > 0)
  }, [recentNodesFull, thirtyDaysAgo])
  const nodes = viewMode === 'drive' ? (data ?? []) : (trashData ?? [])
  const totalCount = nodes.length
  const sortedNodes = React.useMemo(() => {
    const arr = [...nodes]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      } else if (sortBy === 'size') {
        cmp = (a.size ?? 0) - (b.size ?? 0)
        if (a.is_folder && b.is_folder) {
          const ac = a.child_count ?? 0
          const bc = b.child_count ?? 0
          cmp = ac - bc
        }
      } else if (sortBy === 'created_at') {
        cmp = (a.created_at || '').localeCompare(b.created_at || '')
      } else {
        cmp = (a.updated_at || '').localeCompare(b.updated_at || '')
      }
      if (sortOrder === 'desc') cmp = -cmp
      if (cmp === 0) return a.id - b.id
      return cmp
    })
    return arr
  }, [nodes, sortBy, sortOrder])
  const displayNodes = sortedNodes.slice(0, visibleCount)
  const hasMore = totalCount > visibleCount

  const toggleSort = useCallback((key: 'name' | 'size' | 'created_at' | 'updated_at') => {
    setSortBy(key)
    setSortOrder((prev) => (sortBy === key && prev === 'asc' ? 'desc' : 'asc'))
  }, [sortBy])

  useEffect(() => {
    setVisibleCount(20)
    setListReady(false)
    setSelectedIds(new Set())
    setLastClickedIndex(null)
  }, [currentParentId])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setLastClickedIndex(null)
  }, [])

  // Différer l'affichage de la liste pour garder le thread libre et les boutons réactifs (Chromium)
  useEffect(() => {
    if (!isLoading && nodes.length >= 0) {
      const t = setTimeout(() => {
        startTransition(() => setListReady(true))
      }, 150)
      return () => clearTimeout(t)
    }
    setListReady(false)
  }, [isLoading, nodes.length])

  const goTo = useCallback(
    (id: number | null, name: string) => {
      if (id === null) {
        startTransition(() => setBreadcrumb([{ id: null, name: 'Drive' }]))
        return
      }
      const idx = breadcrumb.findIndex((b) => b.id === id)
      if (idx >= 0) {
        startTransition(() => setBreadcrumb(breadcrumb.slice(0, idx + 1)))
      } else {
        startTransition(() => setBreadcrumb([...breadcrumb, { id, name }]))
      }
    },
    [breadcrumb]
  )

  const loadMore = useCallback(() => {
    startTransition(() => setVisibleCount((n) => Math.min(n + 20, totalCount)))
  }, [totalCount])

  // Charger plus d'éléments automatiquement quand on scroll jusqu'en bas (IntersectionObserver absent sous JSDOM/Vitest)
  useEffect(() => {
    if (!hasMore || !listReady || !loadMoreSentinelRef.current || typeof IntersectionObserver === 'undefined') return
    const el = loadMoreSentinelRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, listReady, loadMore])

  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim() || !accessToken) return
    createDriveFolder(accessToken, currentParentId, newFolderName.trim())
      .then(() => {
        toast.success('Dossier créé')
        setNewFolderName('')
        setShowNewFolder(false)
        queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
  }, [newFolderName, accessToken, currentParentId, queryClient])

  const handleRename = useCallback(
    (id: number) => {
      if (!editingName.trim() || !accessToken) return
      renameDriveNode(accessToken, id, editingName.trim())
        .then(() => {
          toast.success('Renommé')
          setEditingId(null)
          setEditingName('')
          queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
    },
    [editingName, accessToken, currentParentId, queryClient]
  )

  const handleDelete = useCallback((node: DriveNode) => {
    if (!accessToken) return
    setDeleteModalTarget({ type: 'single', node })
  }, [accessToken])

  const confirmDeleteFromModal = useCallback(() => {
    if (!accessToken || !deleteModalTarget) return
    const ids = deleteModalTarget.type === 'single' ? [deleteModalTarget.node.id] : deleteModalTarget.ids
    Promise.all(ids.map((id) => deleteDriveNode(accessToken, id)))
      .then(() => {
        toast.success(ids.length === 1 ? 'Déplacé dans la corbeille' : `${ids.length} élément(s) déplacé(s) dans la corbeille`)
        clearSelection()
        setDeleteModalTarget(null)
        queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
        queryClient.invalidateQueries({ queryKey: ['drive', 'trash'] })
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur lors de la suppression'))
  }, [accessToken, deleteModalTarget, currentParentId, queryClient, clearSelection])

  const handleDownload = useCallback(
    (node: DriveNode) => {
      if (!accessToken) return
      const downloadingToast = toast.loading(node.is_folder ? 'Préparation du dossier…' : 'Préparation du téléchargement…')
      const doDownload = node.is_folder
        ? downloadDriveFolderAsZip(accessToken, node.id).then((blob) => ({ blob, name: `${node.name.replace(/\.zip$/i, '')}.zip` }))
        : downloadDriveFile(accessToken, node.id).then((blob) => ({ blob, name: node.name }))
      doDownload
        .then(({ blob, name }) => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = name
          a.click()
          URL.revokeObjectURL(url)
          toast.dismiss(downloadingToast)
          toast.success('Téléchargement démarré')
        })
        .catch((e) => {
          toast.dismiss(downloadingToast)
          toast.error(e instanceof Error ? e.message : 'Erreur')
        })
    },
    [accessToken]
  )

  const handleDownloadSelectionAsZip = useCallback(() => {
    if (!accessToken || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const t = toast.loading('Création de l’archive…')
    downloadDriveArchive(accessToken, ids)
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'archive.zip'
        a.click()
        URL.revokeObjectURL(url)
        toast.dismiss(t)
        toast.success('Téléchargement de l’archive démarré')
      })
      .catch((e) => {
        toast.dismiss(t)
        toast.error(e instanceof Error ? e.message : 'Erreur')
      })
  }, [accessToken, selectedIds])

  const uploadFilesToParent = useCallback(
    (files: FileList | null, parentId: number | null) => {
      if (!files?.length) return
      addUpload(files, parentId)
    },
    [addUpload]
  )

  const handleMove = useCallback(
    (nodeId: number, targetParentId: number | null) => {
      if (!accessToken) return
      moveDriveNode(accessToken, nodeId, targetParentId)
        .then(() => {
          toast.success('Élément déplacé')
          queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
          queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', targetParentId] })
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
    },
    [accessToken, currentParentId, queryClient]
  )

  const startEdit = useCallback((node: DriveNode) => {
    setEditingId(node.id)
    setEditingName(node.name)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingName('')
  }, [])

  // Échap : fermer les modales ou désélectionner. Suppr : ouvrir la modal de confirmation de suppression.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (purgeModalTarget != null) {
        if (e.key === 'Escape') setPurgeModalTarget(null)
        return
      }
      if (deleteModalTarget != null) {
        if (e.key === 'Escape') setDeleteModalTarget(null)
        return
      }
      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && viewMode === 'drive') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        if (selectedIds.size > 0) {
          e.preventDefault()
          setDeleteModalTarget({ type: 'bulk', ids: Array.from(selectedIds) })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds.size, clearSelection, deleteModalTarget, purgeModalTarget, viewMode])

  const handleRowSelect = useCallback(
    (node: DriveNode, index: number, e: React.MouseEvent) => {
      if (e.shiftKey && lastClickedIndex !== null) {
        const from = Math.min(lastClickedIndex, index)
        const to = Math.max(lastClickedIndex, index)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (let i = from; i <= to; i++) {
            const n = displayNodes[i]
            if (n) next.add(n.id)
          }
          return next
        })
      } else {
        // Clic simple ou Ctrl/Cmd : toggle de l'élément (permet de sélectionner plusieurs en enchaînant les clics)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(node.id)) next.delete(node.id)
          else next.add(node.id)
          return next
        })
      }
      setLastClickedIndex(index)
    },
    [lastClickedIndex, displayNodes]
  )

  const handleBulkDelete = useCallback(() => {
    if (!accessToken || selectedIds.size === 0) return
    setDeleteModalTarget({ type: 'bulk', ids: Array.from(selectedIds) })
  }, [accessToken, selectedIds])

  const handleRestore = useCallback(
    (node: DriveNode) => {
      if (!accessToken) return
      restoreDriveNode(accessToken, node.id)
        .then(() => {
          toast.success(`« ${node.name} » restauré`)
          queryClient.invalidateQueries({ queryKey: ['drive', 'trash'] })
          queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', null] })
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
    },
    [accessToken, queryClient]
  )

  const handlePurgeClick = useCallback((node: DriveNode) => setPurgeModalTarget(node), [])
  const confirmPurge = useCallback(() => {
    if (!accessToken || !purgeModalTarget) return
    purgeDriveNode(accessToken, purgeModalTarget.id)
      .then(() => {
        toast.success('Supprimé définitivement')
        setPurgeModalTarget(null)
        queryClient.invalidateQueries({ queryKey: ['drive', 'trash'] })
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Erreur')
      })
  }, [accessToken, purgeModalTarget, queryClient])
  /** Ouvrir le formulaire « Nouveau dossier » au prochain tick pour ne pas bloquer le clic (Chromium). */
  const openNewFolderForm = useCallback(() => {
    setTimeout(() => setShowNewFolder(true), 0)
  }, [])
  const handleNewDocument = useCallback(async () => {
    if (!accessToken) return
    setShowNewFileMenu(false)
    setCreatingDocument(true)
    try {
      const { id, name } = await createDriveFileWithUniqueName(accessToken, currentParentId, 'Sans titre.docx')
      const { htmlToDocxBlob } = await import('../../utils/exportOffice')
      const blob = await htmlToDocxBlob('<p></p>')
      await putDriveNodeContentBlob(accessToken, id, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      if (name !== 'Sans titre.docx') {
        toast.success(`Un document existait déjà à ce nom. Créé sous « ${name} ».`)
      } else {
        toast.success('Document créé')
      }
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
      navigate(`/app/office/editor/${id}`, { state: { from: 'drive', parentId: currentParentId, breadcrumb } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreatingDocument(false)
    }
  }, [accessToken, currentParentId, queryClient, navigate, breadcrumb])

  const handleNewTableur = useCallback(async () => {
    if (!accessToken) return
    setShowNewFileMenu(false)
    setCreatingDocument(true)
    try {
      const { id, name } = await createDriveFileWithUniqueName(accessToken, currentParentId, 'Sans titre.xlsx')
      const { emptyXlsxBlob } = await import('../../utils/exportOffice')
      const blob = emptyXlsxBlob()
      await putDriveNodeContentBlob(accessToken, id, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      if (name !== 'Sans titre.xlsx') {
        toast.success(`Un tableur existait déjà à ce nom. Créé sous « ${name} ».`)
      } else {
        toast.success('Tableur créé')
      }
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
      navigate(`/app/office/editor/${id}`, { state: { from: 'drive', parentId: currentParentId, breadcrumb } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreatingDocument(false)
    }
  }, [accessToken, currentParentId, queryClient, navigate, breadcrumb])

  const handleNewPresentation = useCallback(() => {
    if (!accessToken) return
    setShowNewFileMenu(false)
    setCreatingDocument(true)
    createDriveFileWithUniqueName(accessToken, currentParentId, 'Sans titre (présentation).html')
      .then(({ id, name }) => {
        if (name !== 'Sans titre (présentation).html') {
          toast.success(`Une présentation existait déjà à ce nom. Créé sous « ${name} ».`)
        } else {
          toast.success('Présentation créée')
        }
        queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
        navigate(`/app/office/editor/${id}`, { state: { from: 'drive', parentId: currentParentId, breadcrumb } })
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setCreatingDocument(false))
  }, [accessToken, currentParentId, queryClient, navigate, breadcrumb])
  /** Fermer le formulaire au prochain tick. */
  const closeNewFolderForm = useCallback(() => {
    setTimeout(() => {
      setShowNewFolder(false)
      setNewFolderName('')
    }, 0)
  }, [])
  const handleDragStartRow = useCallback((node: DriveNode) => setDraggedNode(node), [])
  const handleDragEndRow = useCallback(() => {
    setDraggedNode(null)
    setDropTargetFolderId(null)
    setDropTargetIsRoot(false)
  }, [])
  const handleDragOverFolder = useCallback((id: number) => {
    setDropTargetFolderId(id)
    setDropTargetIsRoot(false)
  }, [])
  const handleDragLeaveFolder = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetFolderId(null)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false)
      setDropTargetFolderId(null)
      setDropTargetIsRoot(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      setDropTargetIsRoot(false)
      const files = e.dataTransfer?.files
      if (files?.length) {
        const targetFolderId = dropTargetFolderId ?? currentParentId
        const first = files[0] as File & { webkitRelativePath?: string }
        if (first?.webkitRelativePath) {
          addFolderUpload(files, targetFolderId)
        } else {
          uploadFilesToParent(files, targetFolderId)
        }
        setDropTargetFolderId(null)
        return
      }
      const nodeIdStr = e.dataTransfer?.getData('application/x-cloudity-drive-node')
      if (nodeIdStr) {
        const nodeId = parseInt(nodeIdStr, 10)
        const moveToParent = dropTargetFolderId ?? currentParentId
        if (!Number.isNaN(nodeId)) handleMove(nodeId, moveToParent)
      }
      setDropTargetFolderId(null)
    },
    [dropTargetFolderId, currentParentId, uploadFilesToParent, addFolderUpload, handleMove]
  )

  const onDragOverBreadcrumbRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer?.types.includes('application/x-cloudity-drive-node')) {
      setDropTargetIsRoot(true)
      setDropTargetFolderId(null)
    }
  }, [])

  const onDragLeaveBreadcrumbRoot = useCallback(() => {
    setDropTargetIsRoot(false)
  }, [])

  const onDropOnBreadcrumbRoot = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDropTargetIsRoot(false)
      const nodeIdStr = e.dataTransfer?.getData('application/x-cloudity-drive-node')
      if (nodeIdStr) {
        const nodeId = parseInt(nodeIdStr, 10)
        if (!Number.isNaN(nodeId)) handleMove(nodeId, null)
      }
    },
    [handleMove]
  )

  if (error && error instanceof Error && error.message.includes('401')) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-red-600">
          Session expirée ou token invalide.
          <button
            type="button"
            onClick={() => {
              logout()
              toast.success('Reconnectez-vous.')
            }}
            className="ml-2 text-brand-600 hover:underline"
          >
            Se reconnecter
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 min-h-0">
      {/* Modal de confirmation : déplacer en corbeille */}
      {deleteModalTarget != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-600">
            <h2 id="delete-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Déplacer dans la corbeille ?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {deleteModalTarget.type === 'single'
                ? `« ${deleteModalTarget.node.name} » sera déplacé dans la corbeille. Vous pourrez le restaurer ou le supprimer définitivement depuis la Corbeille.`
                : `${deleteModalTarget.ids.length} élément(s) seront déplacés dans la corbeille.`}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteModalTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDeleteFromModal}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 dark:bg-red-500 rounded-lg hover:bg-red-700 dark:hover:bg-red-600"
                data-testid="drive-confirm-delete-to-trash"
              >
                Déplacer dans la corbeille
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de confirmation : supprimer définitivement (corbeille) */}
      {purgeModalTarget != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="purge-modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-600">
            <h2 id="purge-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Supprimer définitivement ?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              « {purgeModalTarget.name} » sera supprimé définitivement. Cette action est irréversible.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPurgeModalTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmPurge}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 dark:bg-red-500 rounded-lg hover:bg-red-700 dark:hover:bg-red-600"
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Popup d’aperçu fichier (clic sur une ligne fichier) */}
      {previewNode != null && !previewNode.is_folder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title" onClick={() => setPreviewNode(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-600" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 p-6 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-lg bg-slate-100 dark:bg-slate-700 p-3 shrink-0">
                  <File className="h-10 w-10 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="min-w-0">
                  <h2 id="preview-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{displayFileName(previewNode.name)}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{formatFileSize(previewNode.size)} · Modifié {formatRelativeDateWithTime(previewNode.updated_at)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPreviewNode(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Fermer"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 pb-4 overflow-auto flex-1 min-h-0">
              <FilePreviewContent node={previewNode} accessToken={accessToken} />
            </div>
            <div className="p-6 pt-0 flex flex-wrap gap-2 shrink-0">
              {EDITABLE_EXT.includes(getExtension(previewNode.name)) && (
                <Link to={`/app/office/editor/${previewNode.id}`} state={viewMode === 'drive' ? { from: 'drive', parentId: currentParentId, breadcrumb } : undefined} onClick={() => setPreviewNode(null)} className="inline-flex items-center justify-center p-2.5 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600" title="Ouvrir" aria-label="Ouvrir">
                  <Edit3 className="h-5 w-5" />
                </Link>
              )}
              <button type="button" onClick={() => { handleDownload(previewNode); setPreviewNode(null) }} className="inline-flex items-center justify-center p-2.5 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600" title="Télécharger" aria-label="Télécharger">
                <Download className="h-5 w-5" />
              </button>
              {viewMode === 'trash' ? (
                <>
                  <button type="button" onClick={() => { handleRestore(previewNode); setPreviewNode(null) }} className="inline-flex items-center justify-center p-2.5 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600" title="Restaurer" aria-label="Restaurer">
                    <RotateCcw className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => { setPreviewNode(null); handlePurgeClick(previewNode) }} className="inline-flex items-center justify-center p-2.5 rounded-lg bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600" title="Supprimer définitivement" aria-label="Supprimer définitivement">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => { setPreviewNode(null); handleDelete(previewNode) }} className="inline-flex items-center justify-center p-2.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30" title="Déplacer dans la corbeille" aria-label="Déplacer dans la corbeille">
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <button type="button" onClick={() => setPreviewNode(null)} className="inline-flex items-center justify-center p-2.5 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600" title="Fermer" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
      <DriveToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        breadcrumb={breadcrumb}
        onBreadcrumbClick={goTo}
        onNewFolder={openNewFolderForm}
        onNewDocument={handleNewDocument}
        onNewTableur={handleNewTableur}
        onNewPresentation={handleNewPresentation}
        creatingDocument={creatingDocument}
        showNewFileMenu={showNewFileMenu}
        onToggleNewFileMenu={() => setShowNewFileMenu((v) => !v)}
        dropTargetIsRoot={dropTargetIsRoot}
        onDragOverBreadcrumbRoot={onDragOverBreadcrumbRoot}
        onDragLeaveBreadcrumbRoot={onDragLeaveBreadcrumbRoot}
        onDropOnBreadcrumbRoot={onDropOnBreadcrumbRoot}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col min-h-[200px] max-h-[calc(100dvh-11rem)]">
        <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/50 px-4 py-3 flex items-center gap-2 shrink-0">
          <HardDrive className="h-5 w-5 text-slate-400" />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {currentParentId == null ? 'Racine' : breadcrumb[breadcrumb.length - 1]?.name}
          </span>
        </div>
        <div
          className={`relative flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 transition-colors ${dragOver ? 'bg-brand-50 dark:bg-brand-900/30 ring-2 ring-brand-300 dark:ring-brand-600 ring-inset' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {dragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-brand-500/10 dark:bg-brand-600/20 pointer-events-none" aria-hidden>
              <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-500 dark:border-brand-400 bg-white/90 dark:bg-slate-800/90 px-8 py-6">
                <Upload className="h-12 w-12 text-brand-600 dark:text-brand-400" />
                <span className="text-sm font-medium text-brand-800 dark:text-brand-200">Déposez des fichiers ou dossiers ici</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">La structure des dossiers est conservée</span>
              </div>
            </div>
          )}
          {showNewFolder && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-700/70 rounded-lg border border-slate-200 dark:border-slate-600">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                placeholder="Nom du dossier"
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 dark:focus:border-brand-400 focus:ring-1 focus:ring-brand-500 dark:focus:ring-brand-400 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                className="rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-700 dark:hover:bg-brand-600"
              >
                Créer
              </button>
              <button
                type="button"
                onClick={closeNewFolderForm}
                className="rounded-lg border border-slate-300 dark:border-slate-500 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600"
              >
                Annuler
              </button>
            </div>
          )}

          {viewMode === 'recent' ? (
            isRecentFullLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-6" aria-label="Récents par jour">
                {recentGroupedByDay.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                      <Clock className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="mt-4 text-slate-600 dark:text-slate-300">Aucun élément récent (30 derniers jours).</p>
                  </div>
                ) : (
                  recentGroupedByDay.map(({ label, nodes: groupNodes }) => (
                    <section key={label} aria-label={label}>
                      <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">{label}</h2>
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 scrollbar-thin" style={{ scrollbarGutter: 'stable' }}>
                        {groupNodes.map((node) => (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => (node.is_folder ? goTo(node.id, node.name) : setPreviewNode(node))}
                            className="flex-shrink-0 w-28 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex flex-col items-center gap-1.5"
                          >
                            {node.is_folder ? (
                              <Folder className="h-8 w-8 text-amber-500 shrink-0" />
                            ) : (
                              <FileText className="h-8 w-8 text-slate-400 shrink-0" />
                            )}
                            <span className="text-xs text-slate-700 dark:text-slate-200 truncate w-full text-center" title={node.name}>
                              {displayFileName(node.name)}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {formatRelativeDateWithTime(node.updated_at)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            )
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : !listReady ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : nodes.length === 0 && !showNewFolder ? (
            <>
              {viewMode === 'drive' && currentParentId == null && (
                <section
                  className="mb-6 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 overflow-hidden"
                  aria-label="Récents"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-600">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-500" />
                      Récents
                    </h2>
                    <button
                      type="button"
                      onClick={toggleRecentSection}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500"
                      aria-expanded={recentSectionVisible}
                      aria-label={recentSectionVisible ? 'Masquer la section Récents' : 'Afficher la section Récents'}
                      data-testid="drive-recent-section-toggle"
                    >
                      {recentSectionVisible ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {recentSectionVisible && (
                    <div className="flex gap-3 overflow-x-auto p-3 scrollbar-thin" style={{ scrollbarGutter: 'stable' }}>
                      {recentNodes.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun élément récent.</p>
                      ) : (
                        recentNodes.slice(0, 12).map((node) => (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => (node.is_folder ? goTo(node.id, node.name) : setPreviewNode(node))}
                            className="flex-shrink-0 w-24 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex flex-col items-center gap-1"
                          >
                            {node.is_folder ? (
                              <Folder className="h-6 w-6 text-amber-500 shrink-0" />
                            ) : (
                              <FileText className="h-6 w-6 text-slate-400 shrink-0" />
                            )}
                            <span className="text-xs text-slate-700 dark:text-slate-200 truncate w-full text-center" title={node.name}>
                              {displayFileName(node.name)}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {formatRelativeDateWithTime(node.updated_at)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </section>
              )}
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                  <Folder className="h-10 w-10 text-slate-400" />
                </div>
                <p className="mt-4 text-slate-600 dark:text-slate-300">Aucun fichier ni dossier ici.</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Créez un dossier, utilisez Téléverser ou déposez des fichiers ici.
                </p>
              </div>
            </>
          ) : (
            <>
              {viewMode === 'drive' && selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-700">
                  <span className="text-sm font-medium text-brand-800 dark:text-brand-200">
                    {selectedIds.size} élément(s) sélectionné(s)
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline"
                  >
                    Tout désélectionner
                  </button>
                  {(() => {
                    const singleNode = selectedIds.size === 1 ? displayNodes.find((n) => selectedIds.has(n.id)) : null
                    const isSingleFile = singleNode && !singleNode.is_folder
                    return isSingleFile ? (
                      <button
                        type="button"
                        onClick={() => singleNode && handleDownload(singleNode)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
                      >
                        <Download className="h-4 w-4" />
                        Télécharger
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleDownloadSelectionAsZip}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
                      >
                        <Download className="h-4 w-4" />
                        Télécharger en ZIP
                      </button>
                    )
                  })()}
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 dark:bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-600"
                    data-testid="drive-bulk-delete-btn"
                  >
                    <Trash2 className="h-4 w-4" />
                    Déplacer vers la corbeille
                  </button>
                </div>
              )}
              {viewMode === 'drive' && currentParentId == null && (
                <section
                  className="mb-6 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 overflow-hidden"
                  aria-label="Récents"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-600">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-500" />
                      Récents
                    </h2>
                    <button
                      type="button"
                      onClick={toggleRecentSection}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500"
                      aria-expanded={recentSectionVisible}
                      aria-label={recentSectionVisible ? 'Masquer la section Récents' : 'Afficher la section Récents'}
                      data-testid="drive-recent-section-toggle"
                    >
                      {recentSectionVisible ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {recentSectionVisible && (
                    <div className="flex gap-3 overflow-x-auto p-3 scrollbar-thin" style={{ scrollbarGutter: 'stable' }}>
                      {recentNodes.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun élément récent.</p>
                      ) : (
                        recentNodes.slice(0, 12).map((node) => (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => (node.is_folder ? goTo(node.id, node.name) : setPreviewNode(node))}
                            className="flex-shrink-0 w-24 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex flex-col items-center gap-1"
                          >
                            {node.is_folder ? (
                              <Folder className="h-6 w-6 text-amber-500 shrink-0" />
                            ) : (
                              <FileText className="h-6 w-6 text-slate-400 shrink-0" />
                            )}
                            <span className="text-xs text-slate-700 dark:text-slate-200 truncate w-full text-center" title={node.name}>
                              {displayFileName(node.name)}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {formatRelativeDateWithTime(node.updated_at)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </section>
              )}
              {displayMode === 'grid' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id))) {
                          clearSelection()
                        } else {
                          setSelectedIds(new Set(displayNodes.map((n) => n.id)))
                          setLastClickedIndex(null)
                        }
                      }}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      title={displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                      aria-label={displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                    >
                      {displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id)) ? (
                        <Check className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                      ) : (
                        <span className="inline-block w-5 h-5 rounded border border-slate-300 dark:border-slate-500" />
                      )}
                    </button>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Tout sélectionner</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {displayNodes.map((node, index) => (
                      <DriveNodeCard
                        key={node.id}
                        node={node}
                        isSelected={selectedIds.has(node.id)}
                        onSelectClick={(e) => handleRowSelect(node, index, e)}
                        onGoTo={goTo}
                        onPreviewClick={setPreviewNode}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        onStartEdit={startEdit}
                        onRename={handleRename}
                        onCancelEdit={handleCancelEdit}
                        onEditingNameChange={setEditingName}
                        editingName={editingName}
                        isEditing={editingId === node.id}
                        isTrashView={viewMode === 'trash'}
                        onRestore={viewMode === 'trash' ? handleRestore : undefined}
                        onPurge={viewMode === 'trash' ? handlePurgeClick : undefined}
                        editorLinkState={viewMode === 'drive' ? { from: 'drive', parentId: currentParentId, breadcrumb } : undefined}
                        accessToken={accessToken}
                      />
                    ))}
                  </div>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-700/30 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="w-10 py-3 pl-3 pr-1 font-medium">
                        <button
                          type="button"
                          onClick={() => {
                            if (displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id))) {
                              clearSelection()
                            } else {
                              setSelectedIds(new Set(displayNodes.map((n) => n.id)))
                              setLastClickedIndex(null)
                            }
                          }}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                          title={displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                          aria-label={displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                        >
                          {displayNodes.length > 0 && displayNodes.every((n) => selectedIds.has(n.id)) ? (
                            <Check className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                          ) : (
                            <span className="inline-block w-5 h-5 rounded border border-slate-300 dark:border-slate-500" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-2 font-medium">
                        <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
                          Nom {sortBy === 'name' ? (sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : null}
                        </button>
                      </th>
                      <th className="py-3 px-2 font-medium text-right w-28">
                        <button type="button" onClick={() => toggleSort('size')} className="inline-flex items-center gap-1 ml-auto hover:text-slate-700 dark:hover:text-slate-300">
                          Taille {sortBy === 'size' ? (sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : null}
                        </button>
                      </th>
                      <th className="py-3 px-2 font-medium w-32">
                        <button type="button" onClick={() => toggleSort('created_at')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
                          Créé {sortBy === 'created_at' ? (sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : null}
                        </button>
                      </th>
                      <th className="py-3 px-2 font-medium w-32">
                        <button type="button" onClick={() => toggleSort('updated_at')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
                          Modifié {sortBy === 'updated_at' ? (sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : null}
                        </button>
                      </th>
                      <th className="py-3 px-2 font-medium w-32">{viewMode === 'trash' ? 'Supprimé le' : 'Dernier accès'}</th>
                      <th className="py-3 pr-3 pl-1 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayNodes.map((node, index) => (
                      <DriveNodeRow
                        key={node.id}
                        node={node}
                        isEditing={editingId === node.id}
                        editingName={editingName}
                        isDropTarget={dropTargetFolderId === node.id}
                        isSelected={selectedIds.has(node.id)}
                        onSelectClick={(e) => handleRowSelect(node, index, e)}
                        onGoTo={goTo}
                        onStartEdit={startEdit}
                        onRename={handleRename}
                        onCancelEdit={handleCancelEdit}
                        onEditingNameChange={setEditingName}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        onDragStartRow={handleDragStartRow}
                        onDragEndRow={handleDragEndRow}
                        onDragOverFolder={handleDragOverFolder}
                        onDragLeaveFolder={handleDragLeaveFolder}
                        isTrashView={viewMode === 'trash'}
                        onRestore={viewMode === 'trash' ? handleRestore : undefined}
                        onPurge={viewMode === 'trash' ? handlePurgeClick : undefined}
                        editorLinkState={viewMode === 'drive' ? { from: 'drive', parentId: currentParentId, breadcrumb } : undefined}
                        onPreviewClick={setPreviewNode}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              {hasMore && (
                <div ref={loadMoreSentinelRef} className="py-3 px-3 border-t border-slate-100 dark:border-slate-700">
                  <button type="button" onClick={loadMore} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                    Afficher plus ({totalCount - visibleCount} restants)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
