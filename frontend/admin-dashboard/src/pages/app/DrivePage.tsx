import React, { useState, useCallback, useEffect, startTransition } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  HardDrive,
  Folder,
  File,
  FileText,
  Upload,
  ChevronRight,
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
} from 'lucide-react'
import { useAuth } from '../../authContext'
import { useUpload, DRIVE_FILE_INPUT_ID, DRIVE_FOLDER_INPUT_ID } from '../../uploadContext'
import { formatFileSize } from '../../utils/formatFileSize'
import {
  fetchDriveNodes,
  createDriveFolder,
  createDriveFileWithUniqueName,
  renameDriveNode,
  deleteDriveNode,
  downloadDriveFile,
  moveDriveNode,
  type DriveNode,
} from '../../api'
import { EDITABLE_EXT, getExtension } from '../app/DocumentEditorPage'

type BreadcrumbItem = { id: number | null; name: string }

/** Ligne mémoïsée pour limiter les re-renders sous Chromium. */
const DriveNodeRow = React.memo(function DriveNodeRow({
  node,
  isEditing,
  editingName,
  isDropTarget,
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
}: {
  node: DriveNode
  isEditing: boolean
  editingName: string
  isDropTarget: boolean
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
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        onDragStartRow(node)
        e.dataTransfer?.setData('application/x-cloudity-drive-node', String(node.id))
        e.dataTransfer!.effectAllowed = 'move'
      }}
      onDragEnd={onDragEndRow}
      className={`flex items-center gap-3 py-3 px-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg group ${isDropTarget && node.is_folder ? 'ring-2 ring-brand-400 dark:ring-brand-500 bg-brand-50 dark:bg-brand-900/30' : ''}`}
    >
      {isEditing ? (
        <>
          <input
            type="text"
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(node.id)
              if (e.key === 'Escape') onCancelEdit()
            }}
            className="flex-1 rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none"
            autoFocus
          />
          <button type="button" onClick={() => onRename(node.id)} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            OK
          </button>
          <button type="button" onClick={onCancelEdit} className="text-sm text-slate-500 dark:text-slate-400 hover:underline">
            Annuler
          </button>
        </>
      ) : (
        <>
          {node.is_folder ? (
            <button
              type="button"
              onClick={() => onGoTo(node.id, node.name)}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDragOverFolder(node.id)
              }}
              onDragLeave={onDragLeaveFolder}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              <Folder className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{node.name}</span>
            </button>
          ) : (
            <span className="flex items-center gap-2 flex-1 min-w-0">
              <File className="h-5 w-5 text-slate-400 flex-shrink-0" />
              {EDITABLE_EXT.includes(getExtension(node.name)) ? (
                <Link
                  to={`/app/office/editor/${node.id}`}
                  className="text-slate-700 dark:text-slate-300 truncate hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
                >
                  {node.name}
                </Link>
              ) : (
                <span className="text-slate-700 dark:text-slate-300 truncate">{node.name}</span>
              )}
              <span className="text-slate-400 text-sm flex-shrink-0">{formatFileSize(node.size)}</span>
            </span>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            {!node.is_folder && (
              <>
                {EDITABLE_EXT.includes(getExtension(node.name)) && (
                  <Link
                    to={`/app/office/editor/${node.id}`}
                    className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Éditer"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => onDownload(node)}
                  className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200"
                  title="Télécharger"
                >
                  <Download className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onStartEdit(node)}
              className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200"
              title="Renommer"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(node)}
              className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-700 dark:hover:text-red-400"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </li>
  )
})

/** Labels natifs pour ouvrir instantanément le sélecteur de fichiers (inputs dans AppLayout). */
const UploadButton = React.memo(function UploadButton() {
  return (
    <div className="inline-flex items-center gap-2">
      <label
        htmlFor={DRIVE_FILE_INPUT_ID}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer"
      >
        <Upload className="h-4 w-4" />
        <span>Téléverser</span>
      </label>
      <label
        htmlFor={DRIVE_FOLDER_INPUT_ID}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer"
        title="Téléverser un dossier et son contenu"
      >
        <FolderUp className="h-4 w-4" />
        <span>Dossier</span>
      </label>
    </div>
  )
})

/** Barre d'outils Drive mémoïsée pour ne pas recréer les boutons à chaque re-render (Chromium). */
const DriveToolbar = React.memo(function DriveToolbar({
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
}: {
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
}) {
  const showRootDropZone = breadcrumb.length > 1 && onDragOverBreadcrumbRoot && onDropOnBreadcrumbRoot
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
          <Link to="/app" className="hover:text-slate-700 dark:hover:text-slate-300">
            Tableau de bord
          </Link>
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
              {i === 0 && b.id === null && showRootDropZone ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => onBreadcrumbClick(null, b.name)}
                  onDragOver={onDragOverBreadcrumbRoot}
                  onDragLeave={onDragLeaveBreadcrumbRoot}
                  onDrop={onDropOnBreadcrumbRoot}
                  className={`inline-flex items-center rounded px-2 py-0.5 font-medium cursor-pointer select-none ${
                    dropTargetIsRoot
                      ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200 ring-2 ring-brand-400 dark:ring-brand-500'
                      : 'hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  aria-label="Drive (racine) — déposer ici pour déplacer à la racine"
                >
                  {b.name}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick(b.id, b.name)}
                  className="hover:text-slate-900 dark:hover:text-slate-100 font-medium"
                >
                  {b.name}
                </button>
              )}
            </span>
          ))}
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Drive</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Dossiers et fichiers — créez des dossiers en cascade, téléversez des fichiers.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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
                    <span><strong>Document</strong></span>
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
                    <span><strong>Tableur</strong> (.csv)</span>
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
      </div>
    </div>
  )
})

export default function DrivePage() {
  const { accessToken, logout } = useAuth()
  const navigate = useNavigate()
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

  const currentParentId = breadcrumb.length > 1 ? (breadcrumb[breadcrumb.length - 1].id as number) : null

  useEffect(() => {
    setDriveParentId(currentParentId)
    return () => setDriveParentId(null)
  }, [currentParentId, setDriveParentId])

  const { data, isLoading, error } = useQuery({
    queryKey: ['drive', 'nodes', currentParentId],
    queryFn: () => fetchDriveNodes(accessToken!, currentParentId),
    enabled: Boolean(accessToken),
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
    staleTime: 2 * 60 * 1000,
  })
  const nodes = data ?? []
  const totalCount = nodes.length
  const displayNodes = nodes.slice(0, visibleCount)
  const hasMore = totalCount > visibleCount

  useEffect(() => {
    setVisibleCount(20)
    setListReady(false)
  }, [currentParentId])

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

  const handleDelete = useCallback(
    (node: DriveNode) => {
      if (!accessToken) return
      if (!window.confirm(`Supprimer "${node.name}" ?${node.is_folder ? ' (dossier et contenu)' : ''}`)) return
      deleteDriveNode(accessToken, node.id)
        .then(() => {
          toast.success('Supprimé')
          queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
    },
    [accessToken, currentParentId, queryClient]
  )

  const handleDownload = useCallback(
    (node: DriveNode) => {
      if (node.is_folder || !accessToken) return
      downloadDriveFile(accessToken, node.id)
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = node.name
          a.click()
          URL.revokeObjectURL(url)
          toast.success('Téléchargement démarré')
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
    },
    [accessToken]
  )

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
  /** Ouvrir le formulaire « Nouveau dossier » au prochain tick pour ne pas bloquer le clic (Chromium). */
  const openNewFolderForm = useCallback(() => {
    setTimeout(() => setShowNewFolder(true), 0)
  }, [])
  const handleNewDocument = useCallback(() => {
    if (!accessToken) return
    setShowNewFileMenu(false)
    setCreatingDocument(true)
    createDriveFileWithUniqueName(accessToken, currentParentId, 'Sans titre.html')
      .then(({ id, name }) => {
        if (name !== 'Sans titre.html') {
          toast.success(`Un document existait déjà à ce nom. Créé sous « ${name} ».`)
        } else {
          toast.success('Document créé')
        }
        queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
        navigate(`/app/office/editor/${id}`)
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setCreatingDocument(false))
  }, [accessToken, currentParentId, queryClient, navigate])

  const handleNewTableur = useCallback(() => {
    if (!accessToken) return
    setShowNewFileMenu(false)
    setCreatingDocument(true)
    createDriveFileWithUniqueName(accessToken, currentParentId, 'Sans titre.csv')
      .then(({ id, name }) => {
        if (name !== 'Sans titre.csv') {
          toast.success(`Un tableur existait déjà à ce nom. Créé sous « ${name} ».`)
        } else {
          toast.success('Tableur créé')
        }
        queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
        navigate(`/app/office/editor/${id}`)
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setCreatingDocument(false))
  }, [accessToken, currentParentId, queryClient, navigate])

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
        navigate(`/app/office/editor/${id}`)
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setCreatingDocument(false))
  }, [accessToken, currentParentId, queryClient, navigate])
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
        uploadFilesToParent(files, targetFolderId)
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
    [dropTargetFolderId, currentParentId, uploadFilesToParent, handleMove]
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
    <div className="space-y-6">
      <DriveToolbar
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
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/50 px-4 py-3 flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-slate-400" />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {currentParentId == null ? 'Racine' : breadcrumb[breadcrumb.length - 1]?.name}
          </span>
        </div>
        <div
          className={`p-4 transition-colors ${dragOver ? 'bg-brand-50 dark:bg-brand-900/30 ring-2 ring-brand-300 dark:ring-brand-600 ring-inset' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
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

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : !listReady ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : nodes.length === 0 && !showNewFolder ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4">
                <Folder className="h-10 w-10 text-slate-400" />
              </div>
              <p className="mt-4 text-slate-600 dark:text-slate-300">Aucun fichier ni dossier ici.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Créez un dossier ou téléversez un fichier pour commencer.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {displayNodes.map((node) => (
                <DriveNodeRow
                  key={node.id}
                  node={node}
                  isEditing={editingId === node.id}
                  editingName={editingName}
                  isDropTarget={dropTargetFolderId === node.id}
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
                />
              ))}
              {hasMore && (
                <li className="py-3 px-2">
                  <button
                    type="button"
                    onClick={loadMore}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Afficher plus ({totalCount - visibleCount} restants)
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
