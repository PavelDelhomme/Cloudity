import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuth } from './authContext'
import { createDriveFolder, uploadDriveFileWithProgress } from './api'
import {
  UploadContext,
  UploadTriggerContext,
  type UploadItem,
  DRIVE_FILE_INPUT_ID,
  DRIVE_FOLDER_INPUT_ID,
  triggerNoops,
} from './uploadContext'

type QueueEntry = { itemId: string; file: File; parentId: number | null }

let nextId = 0
function genId() {
  return `upload-${Date.now()}-${++nextId}`
}

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
  const [driveParentIdState, setDriveParentIdState] = useState<number | null>(null)
  const parentIdRef = useRef<number | null>(null)
  const queueRef = useRef<QueueEntry[]>([])
  const runningRef = useRef(false)
  const itemsRef = useRef<UploadItem[]>([])
  itemsRef.current = items
  const triggerValueRef = useRef<{ addUploadToCurrentParent: (files: FileList | File[]) => void; addFolderToCurrentParent: (files: FileList) => void }>({ ...triggerNoops })

  const setDriveParentId = useCallback((id: number | null) => {
    parentIdRef.current = id
    setDriveParentIdState(id)
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const processQueue = useCallback(async () => {
    if (!accessToken || runningRef.current || queueRef.current.length === 0) return
    runningRef.current = true
    while (queueRef.current.length > 0) {
      const entry = queueRef.current.shift()!
      const { itemId, file, parentId } = entry
      updateItem(itemId, { status: 'uploading', progress: 0 })
      try {
        await uploadDriveFileWithProgress(accessToken, parentId, file, (percent) => {
          updateItem(itemId, { progress: percent })
        })
        updateItem(itemId, { status: 'done', progress: 100 })
        queryClient.invalidateQueries({ queryKey: ['drive'] })
        toast.success(`« ${file.name} » téléversé`)
      } catch (err) {
        const errWithCode = err as Error & { code?: string }
        const isDuplicate =
          errWithCode.code === 'FILE_EXISTS' ||
          (err instanceof Error && err.message.includes('duplicate key'))
        if (isDuplicate) {
          updateItem(itemId, { status: 'conflict', file })
          continue
        }
        const msg = err instanceof Error ? err.message : 'Erreur'
        updateItem(itemId, { status: 'error', error: msg })
        toast.error(`« ${file.name } » : ${msg}`)
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
        { id, name: file.name, size: file.size, status: 'pending', parentId },
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
                status: 'error',
                error: err instanceof Error ? err.message : 'Erreur création dossier',
                parentId,
              },
            ])
            toast.error(`Dossier « ${folderPath } » : ${err instanceof Error ? err.message : 'Erreur'}`)
            parentId = null
          }
        }
        const fileParentId =
          folderPaths.length === 0
            ? rootParentId
            : (pathToParentId.get(folderPaths[folderPaths.length - 1]) ?? rootParentId)
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

  const cancelConflict = useCallback((id: string) => {
    removeItem(id)
  }, [removeItem])

  const replaceUpload = useCallback(
    (id: string) => {
      const it = itemsRef.current.find((i) => i.id === id)
      if (!it || it.status !== 'conflict' || !it.file) return
      const file = it.file
      updateItem(id, { status: 'uploading', progress: 0 })
      uploadDriveFileWithProgress(accessToken!, it.parentId, file, (p) => updateItem(id, { progress: p }), true)
        .then(() => {
          updateItem(id, { status: 'done', progress: 100, file: undefined })
          queryClient.invalidateQueries({ queryKey: ['drive'] })
          toast.success(`« ${file.name} » téléversé`)
          setTimeout(() => processQueue(), 0)
        })
        .catch((err: Error) => {
          updateItem(id, { status: 'error', error: err.message, file: undefined })
          toast.error(`« ${file.name} » : ${err.message}`)
        })
    },
    [accessToken, updateItem, queryClient, processQueue]
  )

  const value = {
    items,
    addUpload,
    addFolderUpload,
    removeItem,
    clearDone,
    replaceUpload,
    cancelConflict,
    driveParentId: driveParentIdState,
    setDriveParentId,
  }

  triggerValueRef.current.addUploadToCurrentParent = (files: FileList | File[]) => {
    addUpload(files, parentIdRef.current)
  }
  triggerValueRef.current.addFolderToCurrentParent = (files: FileList) => {
    addFolderUpload(files, parentIdRef.current)
  }

  return (
    <UploadContext.Provider value={value}>
      <UploadTriggerContext.Provider value={triggerValueRef.current}>
        {children}
      </UploadTriggerContext.Provider>
    </UploadContext.Provider>
  )
}

/** Inputs fichier/dossier montés une seule fois. Listeners natifs (addEventListener) pour éviter
 * le passage par le système d'événements React (dispatchEvent / DiscreteEventPriority) qui peut
 * geler sous Brave à l'ouverture/fermeture du sélecteur de fichiers. */
const DriveUploadInputsInner = React.memo(function DriveUploadInputsInner() {
  const trigger = React.useContext(UploadTriggerContext)
  const triggerRef = useRef(trigger)
  triggerRef.current = trigger

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fileEl = fileInputRef.current
    const folderEl = folderInputRef.current
    if (!fileEl || !folderEl) return

    const onFileChange = (e: Event) => {
      const input = e.target as HTMLInputElement
      const files = input.files
      if (!files?.length) return
      const list = Array.from(files)
      input.value = ''
      setTimeout(() => triggerRef.current.addUploadToCurrentParent(list), 0)
    }
    const onFolderChange = (e: Event) => {
      const input = e.target as HTMLInputElement
      const files = input.files
      if (!files?.length) return
      const list = files
      setTimeout(() => {
        triggerRef.current.addFolderToCurrentParent(list)
        input.value = ''
      }, 0)
    }

    fileEl.addEventListener('change', onFileChange)
    folderEl.addEventListener('change', onFolderChange)
    return () => {
      fileEl.removeEventListener('change', onFileChange)
      folderEl.removeEventListener('change', onFolderChange)
    }
  }, [])

  return (
    <div aria-hidden className="hidden">
      <input
        ref={fileInputRef}
        id={DRIVE_FILE_INPUT_ID}
        type="file"
        multiple
        tabIndex={-1}
      />
      <input
        ref={folderInputRef}
        id={DRIVE_FOLDER_INPUT_ID}
        type="file"
        {...({ webkitdirectory: '', directory: '', multiple: true } as React.InputHTMLAttributes<HTMLInputElement>)}
        tabIndex={-1}
      />
    </div>
  )
})

export function DriveUploadInputs() {
  return <DriveUploadInputsInner />
}
