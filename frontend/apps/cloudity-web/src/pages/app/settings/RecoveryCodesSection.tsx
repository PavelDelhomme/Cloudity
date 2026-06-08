// RecoveryCodesSection — Settings utilisateur, gestion des codes de récup 2FA.
//
// Affiche le nombre de codes encore utilisables, et permet de régénérer 10
// nouveaux codes (invalide les anciens). Les codes en clair ne sont visibles
// qu'UNE fois, immédiatement après génération — comme GitHub.
//
// Sécurité UX :
//  - Confirmation explicite avant régénération (overwrite des anciens).
//  - Warning visuel si <= 2 codes restants.
//  - Bouton "Tout copier" + "Imprimer" pour ne pas oublier.

import React, { useCallback, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ShieldCheck, RefreshCw, Copy, Printer, AlertTriangle } from 'lucide-react'
import { Button, Card, CardHeader } from '@cloudity/ui'
import { useAuth } from '../../../authContext'
import { countRecoveryCodes, regenerateRecoveryCodes } from '../../../api'

export default function RecoveryCodesSection() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['recovery-codes-count'],
    queryFn: () => countRecoveryCodes(accessToken!),
    enabled: Boolean(accessToken),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateRecoveryCodes(accessToken!),
    onSuccess: (res) => {
      setFreshCodes(res.codes)
      qc.invalidateQueries({ queryKey: ['recovery-codes-count'] })
      toast.success(`${res.count} nouveaux codes générés`)
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  })

  const onCopyAll = useCallback(async () => {
    if (!freshCodes) return
    try {
      await navigator.clipboard.writeText(freshCodes.join('\n'))
      toast.success('Codes copiés dans le presse-papier')
    } catch {
      toast.error('Impossible de copier — sélectionne et copie manuellement.')
    }
  }, [freshCodes])

  const onPrint = useCallback(() => {
    if (!freshCodes) return
    const w = window.open('', '_blank', 'width=480,height=600')
    if (!w) {
      toast.error('Pop-up bloquée — autoriser pour imprimer.')
      return
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Codes de récupération Cloudity</title>
      <style>body{font-family:-apple-system,sans-serif;padding:24px;color:#111}h1{font-size:18px}
      ul{list-style:none;padding:0;font-family:Menlo,monospace;font-size:14px;line-height:1.6}
      li{padding:4px 0;border-bottom:1px dashed #999}
      .warn{background:#fff7ed;border:1px solid #f59e0b;padding:8px 12px;margin-bottom:16px;font-size:12px}</style>
      </head><body>
      <h1>Codes de récupération Cloudity</h1>
      <p class="warn">Conserver dans un endroit sûr. Chaque code n'est utilisable qu'UNE fois.</p>
      <ul>${freshCodes.map((c) => `<li>${c}</li>`).join('')}</ul>
      <p style="font-size:11px;color:#666;margin-top:16px">Généré le ${new Date().toLocaleString('fr-FR')}</p>
      </body></html>`
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }, [freshCodes])

  if (!accessToken) return null

  const active = data?.active ?? 0
  const lowCount = !isLoading && active > 0 && active <= 2

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Codes de récupération 2FA"
        subtitle="Indispensables si tu perds ton authenticator. Stocker dans un coffre offline."
      />
      <div className="p-6 space-y-4">
        {error && <p className="text-red-600 text-sm">Erreur : {(error as Error).message}</p>}

        {!isLoading && (
          <div className="flex items-center gap-3 text-sm">
            <ShieldCheck className={`w-5 h-5 ${active > 0 ? 'text-emerald-500' : 'text-slate-400'}`} />
            <span className="text-slate-700 dark:text-slate-300">
              <strong>{active}</strong> code{active > 1 ? 's' : ''} utilisable{active > 1 ? 's' : ''}
            </span>
            {active === 0 && (
              <span className="text-slate-500 text-xs">— tu n'as pas encore de codes (active la 2FA pour les générer).</span>
            )}
          </div>
        )}

        {lowCount && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Plus que {active} code{active > 1 ? 's' : ''} : pense à régénérer pour en obtenir 10 nouveaux.
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (!window.confirm('Régénérer 10 nouveaux codes ? Cela invalide tous les codes précédents.')) return
              regenerateMutation.mutate()
            }}
            disabled={regenerateMutation.isPending}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
            {regenerateMutation.isPending ? 'Génération…' : 'Générer 10 nouveaux codes'}
          </Button>
        </div>

        {freshCodes && freshCodes.length > 0 && (
          <div className="mt-4 rounded-md border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>Sauvegarde-les MAINTENANT</strong> — ils ne réapparaîtront pas. Sans 2FA et sans
                ces codes, tu ne pourras plus te connecter si tu perds ton authenticator.
              </p>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-sm bg-white dark:bg-slate-800 rounded p-3 border border-amber-200 dark:border-amber-700">
              {freshCodes.map((c, i) => (
                <li key={i} className="text-slate-900 dark:text-slate-100 select-all">
                  {c}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-3">
              <Button onClick={onCopyAll} variant="ghost" className="flex items-center gap-2">
                <Copy className="w-4 h-4" /> Tout copier
              </Button>
              <Button onClick={onPrint} variant="ghost" className="flex items-center gap-2">
                <Printer className="w-4 h-4" /> Imprimer
              </Button>
              <Button onClick={() => setFreshCodes(null)} variant="ghost">
                J'ai sauvegardé — masquer
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
