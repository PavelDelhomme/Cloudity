import React, { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  HardDrive,
  Folder,
  File,
  Upload,
  ChevronRight,
  FolderPlus,
  Trash2,
  Edit2,
  Download,
  Loader2,
  FolderUp,
} from 'lucide-react'
import { useAuth } from '../../authContext'
import { useUpload } from '../../uploadContext'
import { formatFileSize } from '../../utils/formatFileSize'
import {
  fetchDriveNodes,
  createDriveFolder,
  renameDriveNode,
  deleteDriveNode,
  downloadDriveFile,
  moveDriveNode,
  type DriveNode,
} from '../../api'

type BreadcrumbItem = { id: number | null; name: string }

const DRIVE_FILE_INPUT_ID = 'drive-file-upload'
const DRIVE_FOLDER_INPUT_ID = 'drive-folder-upload'

const UploadButton = React.memo(function UploadButton({
  onOpenFileDialog,
  onOpenFolderDialog,
}: {
  onOpenFileDialog: () => void
  onOpenFolderDialog: () => void
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenFileDialog}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Upload className="h-4 w-4" />
        <span>Téléverser</span>
      </button>
      <button
        type="button"
        onClick={onOpenFolderDialog}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer"
        title="Téléverser un dossier et son contenu"
      >
        <FolderUp className="h-4 w-4" />
        <span>Dossier</span>
      </button>
    </div>
  )
})

export default function DrivePage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const { addUpload, addFolderUpload } = useUpload()
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'Drive' }])
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null)
  const [draggedNode, setDraggedNode] = useState<DriveNode | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const [listReady, setListReady] = useState(false)

  const currentParentId = breadcrumb.length > 1 ? (breadcrumb[breadcrumb.length - 1].id as number) : null

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

  // Différer l'affichage de la liste d'un frame pour que le bouton Téléverser soit réactif au premier clic
  useEffect(() => {
    if (!isLoading && nodes.length >= 0) {
      const id = requestAnimationFrame(() => {
        setListReady(true)
      })
      return () => cancelAnimationFrame(id)
    }
    setListReady(false)
  }, [isLoading, nodes.length])

  const goTo = useCallback(
    (id: number | null, name: string) => {
      if (id === null) {
        setBreadcrumb([{ id: null, name: 'Drive' }])
        return
      }
      const idx = breadcrumb.findIndex((b) => b.id === id)
      if (idx >= 0) {
        setBreadcrumb(breadcrumb.slice(0, idx + 1))
      } else {
        setBreadcrumb([...breadcrumb, { id, name }])
      }
    },
    [breadcrumb]
  )

  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + 20, totalCount))
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

  /** Ouvre le sélecteur de fichiers en différé pour ne pas bloquer le thread au clic. */
  const openFileDialog = useCallback(() => {
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 0)
  }, [])

  const openFolderDialog = useCallback(() => {
    setTimeout(() => {
      folderInputRef.current?.click()
    }, 0)
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
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
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

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      addUpload(files, currentParentId)
      e.target.value = ''
    },
    [addUpload, currentParentId]
  )

  const handleFolderUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      addFolderUpload(files, currentParentId)
      e.target.value = ''
    },
    [addFolderUpload, currentParentId]
  )

  // Inputs fichier / dossier rendus dans document.body
  const fileInputEl = (
    <div>
      <input
        id={DRIVE_FILE_INPUT_ID}
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleUpload}
        tabIndex={-1}
        aria-hidden
      />
      <input
        id={DRIVE_FOLDER_INPUT_ID}
        ref={folderInputRef}
        type="file"
        className="hidden"
        {...({ webkitdirectory: '', directory: '', multiple: true } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleFolderUpload}
        tabIndex={-1}
        aria-hidden
      />
    </div>
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
            <Link to="/app" className="hover:text-slate-700 dark:hover:text-slate-300">
              Tableau de bord
            </Link>
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
                <button
                  type="button"
                  onClick={() => goTo(b.id, b.name)}
                  className="hover:text-slate-900 dark:hover:text-slate-100 font-medium"
                >
                  {b.name}
                </button>
              </span>
            ))}
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Drive</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Dossiers et fichiers — créez des dossiers en cascade, téléversez des fichiers.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <UploadButton onOpenFileDialog={openFileDialog} onOpenFolderDialog={openFolderDialog} />
          {typeof document !== 'undefined' && createPortal(fileInputEl, document.body)}
          <button
            type="button"
            onClick={() => setShowNewFolder(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600"
          >
            <FolderPlus className="h-4 w-4" />
            Nouveau dossier
          </button>
        </div>
      </div>

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
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                placeholder="Nom du dossier"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700"
              >
                Créer
              </button>
              <button
                type="button"
                onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
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
                <li
                  key={node.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedNode(node)
                    e.dataTransfer?.setData('application/x-cloudity-drive-node', String(node.id))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDraggedNode(null)
                    setDropTargetFolderId(null)
                  }}
                  className={`flex items-center gap-3 py-3 px-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg group ${dropTargetFolderId === node.id && node.is_folder ? 'ring-2 ring-brand-400 dark:ring-brand-500 bg-brand-50 dark:bg-brand-900/30' : ''}`}
                >
                  {editingId === node.id ? (
                    <>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(node.id)
                          if (e.key === 'Escape') { setEditingId(null); setEditingName('') }
                        }}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(node.id)}
                        className="text-sm text-brand-600 hover:underline"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditingName('') }}
                        className="text-sm text-slate-500 hover:underline"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      {node.is_folder ? (
                        <button
                          type="button"
                          onClick={() => goTo(node.id, node.name)}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDropTargetFolderId(node.id)
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetFolderId(null)
                          }}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          <Folder className="h-5 w-5 text-amber-500 flex-shrink-0" />
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{node.name}</span>
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 flex-1 min-w-0">
                          <File className="h-5 w-5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-700 dark:text-slate-300 truncate">{node.name}</span>
                          <span className="text-slate-400 text-sm flex-shrink-0">
                            {formatFileSize(node.size)}
                          </span>
                        </span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        {!node.is_folder && (
                          <button
                            type="button"
                            onClick={() => handleDownload(node)}
                            className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200"
                            title="Télécharger"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(node)}
                          className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200"
                          title="Renommer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(node)}
                          className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-700 dark:hover:text-red-400"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
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
