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

  const value = {
    items,
    addUpload,
    addFolderUpload,
    removeItem,
    clearDone,
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

/** Inputs fichier/dossier montés une seule fois ; n'utilise que le contexte trigger (ref stable) pour éviter re-renders sous Chromium. */
const DriveUploadInputsInner = React.memo(function DriveUploadInputsInner() {
  const trigger = React.useContext(UploadTriggerContext)
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      trigger.addUploadToCurrentParent(files)
      e.target.value = ''
    },
    [trigger]
  )
  const handleFolderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      trigger.addFolderToCurrentParent(files)
      e.target.value = ''
    },
    [trigger]
  )
  return (
    <div aria-hidden className="hidden">
      <input
        id={DRIVE_FILE_INPUT_ID}
        type="file"
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />
      <input
        id={DRIVE_FOLDER_INPUT_ID}
        type="file"
        {...({ webkitdirectory: '', directory: '', multiple: true } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleFolderChange}
        tabIndex={-1}
      />
    </div>
  )
})

export function DriveUploadInputs() {
  return <DriveUploadInputsInner />
}
