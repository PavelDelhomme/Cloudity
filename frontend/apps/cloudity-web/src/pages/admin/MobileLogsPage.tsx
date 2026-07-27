import React, { useCallback, useEffect, useState } from 'react'
import { fetchMobileCrashDetail, fetchMobileCrashList, type MobileCrashListItem } from '../../api'

export default function MobileLogsPage() {
  const [items, setItems] = useState<MobileCrashListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchMobileCrashList()
      setItems(res.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void (async () => {
      try {
        const d = await fetchMobileCrashDetail(selectedId)
        setDetail(d)
      } catch (e) {
        setDetail({ error: e instanceof Error ? e.message : String(e) })
      }
    })()
  }, [selectedId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Logs mobile</h1>
          <p className="text-sm text-slate-400 mt-1">
            Crashes et retours manuels des apps Flutter (pipeline inspiré JobbingTrack).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="px-3 py-2 rounded-lg bg-slate-800 text-slate-100 text-sm hover:bg-slate-700"
        >
          Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium text-slate-200">
            Rapports ({items.length})
          </div>
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Aucun rapport pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-slate-800 max-h-[32rem] overflow-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-900/80 ${
                      selectedId === item.id ? 'bg-slate-900' : ''
                    }`}
                  >
                    <div className="text-sm font-mono text-emerald-400">{item.id}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(item.modified).toLocaleString('fr-FR')} · {(item.sizeBytes / 1024).toFixed(1)} Ko
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium text-slate-200">
            Détail
          </div>
          {!selectedId ? (
            <p className="p-4 text-sm text-slate-400">Sélectionnez un rapport.</p>
          ) : !detail ? (
            <p className="p-4 text-sm text-slate-400">Chargement du détail…</p>
          ) : (
            <pre className="p-4 text-xs text-slate-300 overflow-auto max-h-[32rem] whitespace-pre-wrap break-words">
              {JSON.stringify(detail, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
