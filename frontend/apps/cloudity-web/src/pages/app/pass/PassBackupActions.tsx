import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@cloudity/ui'
import { Download, Upload, HardDrive } from 'lucide-react'
import {
  downloadPassBackupFile,
  exportPassBackup,
  importPassBackup,
  passBackupSummary,
  readPassBackupFile,
} from './passBackup'

type PassBackupActionsProps = {
  accessToken: string
  userId: string
  onImported?: () => void
}

export default function PassBackupActions({
  accessToken,
  userId,
  onImported,
}: PassBackupActionsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const onExport = async () => {
    setExporting(true)
    try {
      const result = await exportPassBackup(accessToken, userId)
      downloadPassBackupFile(result.backup, result.filename)
      toast.success(
        `Sauvegarde téléchargée (${result.stats.vaultCount} coffre(s), ${result.stats.itemCount} entrée(s)).`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export impossible')
    } finally {
      setExporting(false)
    }
  }

  const onPickImport = () => fileRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const backup = await readPassBackupFile(file)
      const summary = passBackupSummary(backup)
      if (
        !confirm(
          `Restaurer cette sauvegarde ?\n\n${summary}\n\nLes entrées déjà présentes (même ciphertext) seront ignorées.`
        )
      ) {
        return
      }
      const result = await importPassBackup(accessToken, backup, { targetUserId: userId })
      toast.success(
        `Restauration terminée : ${result.itemsImported} importée(s), ${result.itemsSkipped} ignorée(s), ${result.vaultsCreated} coffre(s) créé(s).`
      )
      onImported?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import impossible')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFile}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={exporting}
        onClick={onExport}
        title="Télécharge une copie chiffrée (blobs ciphertext) — backup local ou distant"
      >
        <Download className="w-4 h-4 mr-1.5" aria-hidden />
        {exporting ? 'Export…' : 'Exporter sauvegarde'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={importing}
        onClick={onPickImport}
        title="Restaure depuis un fichier cloudity-pass-backup-*.json"
      >
        <Upload className="w-4 h-4 mr-1.5" aria-hidden />
        {importing ? 'Import…' : 'Restaurer sauvegarde'}
      </Button>
      <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
        <HardDrive className="w-3.5 h-3.5" aria-hidden />
        Backup local + cloud (cf. doc Pass)
      </span>
    </div>
  )
}
