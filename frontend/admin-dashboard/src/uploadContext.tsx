import React, { createContext, useContext } from 'react'

export type UploadItem = {
  id: string
  name: string
  size?: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  parentId: number | null
  /** 0–100 pendant l'upload (optionnel). */
  progress?: number
}

export type UploadContextValue = {
  items: UploadItem[]
  addUpload: (files: FileList | File[], parentId: number | null) => void
  addFolderUpload: (files: FileList, parentId: number | null) => void
  removeItem: (id: string) => void
  clearDone: () => void
  driveParentId: number | null
  setDriveParentId: (id: number | null) => void
}

/** Contexte stable (ref) pour les seuls callbacks d'upload, afin de ne pas faire re-render les inputs sous Chromium. */
export type UploadTriggerValue = {
  addUploadToCurrentParent: (files: FileList | File[]) => void
  addFolderToCurrentParent: (files: FileList) => void
}

const noop = () => {}
export const triggerNoops: UploadTriggerValue = {
  addUploadToCurrentParent: noop,
  addFolderToCurrentParent: noop,
}
export const defaultUploadContextValue: UploadContextValue = {
  items: [],
  addUpload: noop,
  addFolderUpload: noop,
  removeItem: noop,
  clearDone: noop,
  driveParentId: null,
  setDriveParentId: noop,
}

export const UploadContext = createContext<UploadContextValue | null>(null)
export const UploadTriggerContext = createContext<UploadTriggerValue>(triggerNoops)

/** IDs des inputs cachés pour les labels natifs (Drive). */
export const DRIVE_FILE_INPUT_ID = 'drive-file-upload'
export const DRIVE_FOLDER_INPUT_ID = 'drive-folder-upload'

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext)
  return ctx ?? defaultUploadContextValue
}
