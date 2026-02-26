import React, { useState, useCallback } from 'react'
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
} from 'lucide-react'
import { useAuth } from '../../authContext'
import {
  fetchDriveNodes,
  createDriveFolder,
  renameDriveNode,
  deleteDriveNode,
  downloadDriveFile,
  uploadDriveFile,
  moveDriveNode,
  type DriveNode,
} from '../../api'

type BreadcrumbItem = { id: number | null; name: string }

export default function DrivePage() {
  const { accessToken, logout } = useAuth()
  const queryClient = useQueryClient()
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'Drive' }])
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null)
  const [draggedNode, setDraggedNode] = useState<DriveNode | null>(null)

  const currentParentId = breadcrumb.length > 1 ? (breadcrumb[breadcrumb.length - 1].id as number) : null

  const { data, isLoading, error } = useQuery({
    queryKey: ['drive', 'nodes', currentParentId],
    queryFn: () => fetchDriveNodes(accessToken!, currentParentId),
    enabled: Boolean(accessToken),
    retry: (_, err) => !(err instanceof Error && err.message.includes('401')),
  })
  const nodes = data ?? []

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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !accessToken) return
    try {
      await createDriveFolder(accessToken, currentParentId, newFolderName.trim())
      toast.success('Dossier créé')
      setNewFolderName('')
      setShowNewFolder(false)
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const handleRename = async (id: number) => {
    if (!editingName.trim() || !accessToken) return
    try {
      await renameDriveNode(accessToken, id, editingName.trim())
      toast.success('Renommé')
      setEditingId(null)
      setEditingName('')
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const handleDelete = async (node: DriveNode) => {
    if (!accessToken) return
    if (!window.confirm(`Supprimer "${node.name}" ?${node.is_folder ? ' (dossier et contenu)' : ''}`)) return
    try {
      await deleteDriveNode(accessToken, node.id)
      toast.success('Supprimé')
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const handleDownload = async (node: DriveNode) => {
    if (node.is_folder || !accessToken) return
    try {
      const blob = await downloadDriveFile(accessToken, node.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = node.name
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Téléchargement démarré')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !accessToken) return
    setUploading(true)
    try {
      await uploadDriveFile(accessToken, currentParentId, file)
      toast.success('Fichier téléversé')
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const uploadFilesToParent = async (files: FileList | null, parentId: number | null) => {
    if (!files?.length || !accessToken) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadDriveFile(accessToken, parentId, files[i])
      }
      toast.success(files.length > 1 ? `${files.length} fichiers téléversés` : 'Fichier téléversé')
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', parentId ?? currentParentId] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setUploading(false)
    }
  }

  const handleMove = async (nodeId: number, targetParentId: number | null) => {
    if (!accessToken) return
    try {
      await moveDriveNode(accessToken, nodeId, targetParentId)
      toast.success('Élément déplacé')
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', currentParentId] })
      queryClient.invalidateQueries({ queryKey: ['drive', 'nodes', targetParentId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const startEdit = (node: DriveNode) => {
    setEditingId(node.id)
    setEditingName(node.name)
  }

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
          <nav className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
            <Link to="/app" className="hover:text-slate-700">
              Tableau de bord
            </Link>
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
                <button
                  type="button"
                  onClick={() => goTo(b.id, b.name)}
                  className="hover:text-slate-900 font-medium"
                >
                  {b.name}
                </button>
              </span>
            ))}
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Drive</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dossiers et fichiers — créez des dossiers en cascade, téléversez des fichiers.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span>Téléverser</span>
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowNewFolder(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <FolderPlus className="h-4 w-4" />
            Nouveau dossier
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-slate-400" />
          <span className="font-medium text-slate-700">
            {currentParentId == null ? 'Racine' : breadcrumb[breadcrumb.length - 1]?.name}
          </span>
        </div>
        <div
          className={`p-4 transition-colors ${dragOver ? 'bg-brand-50 ring-2 ring-brand-300 ring-inset' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOver(false)
              setDropTargetFolderId(null)
            }
          }}
          onDrop={(e) => {
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
          }}
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
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : nodes.length === 0 && !showNewFolder ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <Folder className="h-10 w-10 text-slate-400" />
              </div>
              <p className="mt-4 text-slate-600">Aucun fichier ni dossier ici.</p>
              <p className="mt-1 text-sm text-slate-500">
                Créez un dossier ou téléversez un fichier pour commencer.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {nodes.map((node) => (
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
                  className={`flex items-center gap-3 py-3 px-2 hover:bg-slate-50 rounded-lg group ${dropTargetFolderId === node.id && node.is_folder ? 'ring-2 ring-brand-400 bg-brand-50' : ''}`}
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
                          <span className="font-medium text-slate-900 truncate">{node.name}</span>
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 flex-1 min-w-0">
                          <File className="h-5 w-5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-700 truncate">{node.name}</span>
                          <span className="text-slate-400 text-sm flex-shrink-0">
                            {(node.size / 1024).toFixed(1)} Ko
                          </span>
                        </span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        {!node.is_folder && (
                          <button
                            type="button"
                            onClick={() => handleDownload(node)}
                            className="p-1.5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            title="Télécharger"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(node)}
                          className="p-1.5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                          title="Renommer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(node)}
                          className="p-1.5 rounded text-slate-500 hover:bg-red-100 hover:text-red-700"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
