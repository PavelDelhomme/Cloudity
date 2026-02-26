import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './authContext'
import { createDriveFolder, uploadDriveFile } from './api'

export type UploadItem = {
  id: string
  name: string
  size?: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  parentId: number | null
}

type QueueEntry = { itemId: string; file: File; parentId: number | null }

type UploadContextValue = {
  items: UploadItem[]
  addUpload: (files: FileList | File[], parentId: number | null) => void
  addFolderUpload: (files: FileList, parentId: number | null) => void
  removeItem: (id: string) => void
  clearDone: () => void
}

const UploadContext = createContext<UploadContextValue | null>(null)

let nextId = 0
function genId() {
  return `upload-${Date.now()}-${++nextId}`
}

/** Construit le chemin des dossiers à créer à partir de webkitRelativePath (ex: "A/B/file.txt" -> ["A", "A/B"]). */
function getFolderPaths(relativePath: string): string[] {
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  const folders: string[] = []
  for (let i = 0; i < parts.length - 1; i++) {
    folders.push(parts.slice(0, i + 1).join('/'))
  }
  return folders
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [items, setItems] = useState<UploadItem[]>([])
  const queueRef = useRef<QueueEntry[]>([])
  const runningRef = useRef(false)

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const processQueue = useCallback(async () => {
    if (!accessToken || runningRef.current || queueRef.current.length === 0) return
    runningRef.current = true
    while (queueRef.current.length > 0) {
      const entry = queueRef.current.shift()!
      const { itemId, file, parentId } = entry
      updateItem(itemId, { status: 'uploading' })
      try {
        await uploadDriveFile(accessToken, parentId, file)
        updateItem(itemId, { status: 'done' })
        queryClient.invalidateQueries({ queryKey: ['drive'] })
      } catch (err) {
        updateItem(itemId, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Erreur',
        })
      }
    }
    runningRef.current = false
  }, [accessToken, updateItem, queryClient])

  useEffect(() => {
    processQueue()
  }, [items, processQueue])

  const enqueueFile = useCallback(
    (file: File, parentId: number | null) => {
      const id = genId()
      setItems((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          size: file.size,
          status: 'pending',
          parentId,
        },
      ])
      queueRef.current.push({ itemId: id, file, parentId })
    },
    []
  )

  const addUpload = useCallback(
    (files: FileList | File[], parentId: number | null) => {
      const list = Array.isArray(files) ? files : Array.from(files)
      list.forEach((file) => enqueueFile(file, parentId))
      setTimeout(() => processQueue(), 0)
    },
    [enqueueFile, processQueue]
  )

  const addFolderUpload = useCallback(
    async (fileList: FileList, rootParentId: number | null) => {
      if (!accessToken) return
      const pathToParentId = new Map<string, number | null>()
      pathToParentId.set('', rootParentId)
      const filesWithParent: { file: File; parentId: number | null }[] = []

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]
        const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        const folderPaths = getFolderPaths(relPath)
        let parentId: number | null = rootParentId
        for (const folderPath of folderPaths) {
          if (pathToParentId.has(folderPath)) {
            parentId = pathToParentId.get(folderPath)!
            continue
          }
          const name = folderPath.split('/').pop()!
          try {
            const res = await createDriveFolder(accessToken, parentId, name)
            pathToParentId.set(folderPath, res.id)
            parentId = res.id
          } catch (err) {
            const id = genId()
            setItems((prev) => [
              ...prev,
              {
                id,
                name: folderPath,
                size: undefined,
                status: 'error',
                error: err instanceof Error ? err.message : 'Erreur création dossier',
                parentId,
              },
            ])
            parentId = null
          }
        }
        const fileParentId = folderPaths.length === 0 ? rootParentId : (pathToParentId.get(folderPaths[folderPaths.length - 1]) ?? rootParentId)
        filesWithParent.push({ file, parentId: fileParentId })
      }

      filesWithParent.forEach(({ file, parentId: pid }) => {
        enqueueFile(file, pid)
      })
      setTimeout(() => processQueue(), 0)
    },
    [accessToken, enqueueFile, processQueue]
  )

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
    queueRef.current = queueRef.current.filter((e) => e.itemId !== id)
  }, [])

  const clearDone = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.status !== 'done' && it.status !== 'error'))
  }, [])

  const value: UploadContextValue = {
    items,
    addUpload,
    addFolderUpload,
    removeItem,
    clearDone,
  }

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}

export function useUpload() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be used within UploadProvider')
  return ctx
}
