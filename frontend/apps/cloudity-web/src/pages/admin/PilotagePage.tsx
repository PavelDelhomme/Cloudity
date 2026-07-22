import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
import { useAuth } from '../../authContext'
import {
  fetchPilotageBoard,
  postPilotageAction,
  type PilotageActionPayload,
  type PilotageBoard,
  type PilotageTask,
  type PilotageTaskStatus,
} from '../../api'
import { Card, PageLayout } from '@cloudity/ui'
import { ApiError } from '@cloudity/shared'

function statusClass(status: PilotageTaskStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
    case 'ko':
    case 'rework':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
    case 'partial':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
    case 'deferred':
      return 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
    default:
      return 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
  }
}

function statusLabel(status: PilotageTaskStatus): string {
  switch (status) {
    case 'ok':
      return 'OK'
    case 'ko':
      return 'KO'
    case 'partial':
      return 'Partiel'
    case 'deferred':
      return 'Plus tard'
    case 'rework':
      return 'À reprendre'
    default:
      return 'À faire'
  }
}

function Accordion({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left dark:bg-slate-900/80"
        aria-expanded={open}
      >
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {title}
          {typeof count === 'number' ? (
            <span className="ml-2 text-sm font-normal text-slate-500">({count})</span>
          ) : null}
        </span>
        <span className="text-slate-500">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:p-4">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: PilotageTask
  selected: boolean
  onSelect: () => void
}) {
  const done = task.checklist.filter((c) => c.done).length
  const total = task.checklist.length
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-brand-400 bg-brand-50/60 dark:border-brand-600 dark:bg-brand-950/30'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{task.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {task.section}
            {total > 0 ? ` · ${done}/${total} critères` : null}
          </p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusClass(task.status)}`}>
          {statusLabel(task.status)}
        </span>
      </div>
    </button>
  )
}

function TaskDetail({
  task,
  canWrite,
  cycles,
  busy,
  onAction,
}: {
  task: PilotageTask
  canWrite: boolean
  cycles: { id: string; label: string }[]
  busy: boolean
  onAction: (payload: PilotageActionPayload) => void
}) {
  const [note, setNote] = useState(task.porteurNote || '')

  return (
    <Card className="p-4 sm:p-5 sticky top-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-mono text-slate-500">{task.id}</p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{task.label}</h2>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusClass(task.status)}`}>
          {statusLabel(task.status)}
        </span>
      </div>

      {task.description ? (
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 whitespace-pre-wrap">{task.description}</p>
      ) : null}

      <div className="mb-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Attendu</p>
        <p className="text-sm text-slate-800 dark:text-slate-200">{task.expected}</p>
      </div>

      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Critères</p>
        <ul className="space-y-2">
          {task.checklist.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={c.done}
                disabled={!canWrite || busy}
                onChange={(e) =>
                  onAction({
                    type: 'checklist',
                    itemId: task.id,
                    checklistItemId: c.id,
                    done: e.target.checked,
                  })
                }
              />
              <span className={`text-sm ${c.done ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                {c.label}
              </span>
            </li>
          ))}
          {task.checklist.length === 0 ? (
            <li className="text-xs text-slate-500">Aucun critère — ajoute-en via une prochaine itération.</li>
          ) : null}
        </ul>
      </div>

      <label className="block mb-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</span>
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          rows={3}
          value={note}
          disabled={!canWrite || busy}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (canWrite && note !== (task.porteurNote || '')) {
              onAction({ type: 'note', itemId: task.id, note })
            }
          }}
        />
      </label>

      {canWrite ? (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {(
              [
                ['OK', 'OK'],
                ['PARTIEL', 'Partiel'],
                ['KO', 'KO'],
                ['REWORK', 'À reprendre'],
                ['PLUS_TARD', 'Plus tard'],
              ] as const
            ).map(([decision, label]) => (
              <button
                key={decision}
                type="button"
                disabled={busy}
                onClick={() => onAction({ type: 'decide', itemId: task.id, decision, note })}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs dark:border-slate-600"
              onClick={() => onAction({ type: 'reorder', itemId: task.id, direction: 'up' })}
            >
              <ChevronUp className="w-3.5 h-3.5" /> Monter
            </button>
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs dark:border-slate-600"
              onClick={() => onAction({ type: 'reorder', itemId: task.id, direction: 'down' })}
            >
              <ChevronDown className="w-3.5 h-3.5" /> Descendre
            </button>
            <select
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs px-2 py-1"
              disabled={busy}
              value={task.cycleId || ''}
              onChange={(e) =>
                onAction({
                  type: 'move',
                  itemId: task.id,
                  cycleId: e.target.value || null,
                })
              }
            >
              <option value="">Sans cycle</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Lecture seule (écriture désactivée pour cet environnement).
        </p>
      )}

      {task.history?.length ? (
        <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
          <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Historique</p>
          <ul className="space-y-1 max-h-40 overflow-auto">
            {[...task.history].reverse().slice(0, 12).map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-[11px] text-slate-500 font-mono">
                {h.at.slice(0, 19)} · {h.action}
                {h.note ? ` — ${h.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}

export default function PilotagePage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    now: true,
    cycles: true,
    recent: false,
  })
  const [flash, setFlash] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['pilotage-board'],
    queryFn: () => fetchPilotageBoard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 60_000,
  })

  const actionMut = useMutation({
    mutationFn: (payload: PilotageActionPayload) => postPilotageAction(accessToken!, payload),
    onSuccess: (res) => {
      queryClient.setQueryData(['pilotage-board'], res)
      setFlash(res.message || 'Mis à jour')
      window.setTimeout(() => setFlash(null), 3500)
    },
  })

  const board: PilotageBoard | undefined = data?.board
  const canWrite = Boolean(data?.canWrite)
  const selected = useMemo(() => {
    if (!board?.tasks) return null
    if (selectedId && board.tasks[selectedId]) return board.tasks[selectedId]
    const activeId = board.active?.id
    if (activeId && board.tasks[activeId]) return board.tasks[activeId]
    const first = Object.values(board.tasks)[0]
    return first || null
  }, [board, selectedId])

  const cycleViews = board?.cycleViews || []
  const nowCycle = cycleViews.find((c) => c.id === 'cycle-now')
  const otherCycles = cycleViews.filter((c) => c.id !== 'cycle-now')

  const tasksFor = (ids: string[]) =>
    ids.map((id) => board?.tasks[id]).filter(Boolean) as PilotageTask[]

  if (!accessToken) {
    return (
      <PageLayout title="Pilotage">
        <p className="text-slate-500">Non authentifié.</p>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Pilotage projet"
      description="Suivi des tâches à faire / à valider / terminées — comme JobbingTrack, mis à jour depuis cette interface."
    >
      <Card className="p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <ClipboardList className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <p>
              Env <span className="font-mono">{data?.runtimeEnv ?? '…'}</span>
              {data?.storageReady === false ? (
                <span className="ml-2 text-amber-700 dark:text-amber-300">· migrate 48 requis</span>
              ) : null}
              {canWrite ? (
                <span className="ml-2 text-emerald-700 dark:text-emerald-300">· écriture ON</span>
              ) : (
                <span className="ml-2 text-slate-500">· lecture seule</span>
              )}
            </p>
            {board?.active ? (
              <p className="mt-1">
                En cours : <strong>{board.active.label}</strong>
              </p>
            ) : (
              <p className="mt-1 text-slate-500">Aucune tâche « ouverte » dans le cycle immédiat.</p>
            )}
            {flash ? <p className="mt-1 text-emerald-700 dark:text-emerald-300 text-xs">{flash}</p> : null}
            {actionMut.isError ? (
              <p className="mt-1 text-red-600 text-xs">
                {actionMut.error instanceof ApiError
                  ? actionMut.error.message
                  : actionMut.error instanceof Error
                    ? actionMut.error.message
                    : 'Erreur action'}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Rafraîchir
        </button>
      </Card>

      {isLoading ? (
        <p className="text-slate-500">Chargement du tableau…</p>
      ) : error ? (
        <Card className="p-4 text-red-600">
          {error instanceof ApiError ? error.message : 'Impossible de charger le board.'}
        </Card>
      ) : board ? (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3 space-y-3">
            {board.counts ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {(['open', 'partial', 'ok', 'ko', 'deferred'] as const).map((k) => (
                  <span key={k} className={`rounded-full px-2.5 py-1 font-medium ${statusClass(k === 'ko' ? 'ko' : k)}`}>
                    {statusLabel(k === 'ko' ? 'ko' : k)} {board.counts?.[k] ?? 0}
                  </span>
                ))}
              </div>
            ) : null}

            <Accordion
              title="À faire maintenant"
              count={nowCycle?.total}
              open={openSections.now !== false}
              onToggle={() => setOpenSections((s) => ({ ...s, now: !s.now }))}
            >
              <div className="space-y-2">
                {tasksFor(nowCycle?.itemIds || []).map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    selected={selected?.id === t.id}
                    onSelect={() => setSelectedId(t.id)}
                  />
                ))}
              </div>
            </Accordion>

            <Accordion
              title="Cycles"
              count={otherCycles.length}
              open={openSections.cycles !== false}
              onToggle={() => setOpenSections((s) => ({ ...s, cycles: !s.cycles }))}
            >
              <div className="space-y-4">
                {otherCycles.map((cycle) => (
                  <div key={cycle.id}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{cycle.label}</h3>
                      <span className="text-xs text-slate-500">{cycle.progressLabel}</span>
                    </div>
                    {cycle.description ? (
                      <p className="text-xs text-slate-500 mb-2">{cycle.description}</p>
                    ) : null}
                    <div className="space-y-2">
                      {tasksFor(cycle.itemIds).map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          selected={selected?.id === t.id}
                          onSelect={() => setSelectedId(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Accordion>

            <Accordion
              title="Récemment terminées"
              count={board.recentDone?.length}
              open={Boolean(openSections.recent)}
              onToggle={() => setOpenSections((s) => ({ ...s, recent: !s.recent }))}
            >
              <ul className="space-y-1">
                {(board.recentDone || []).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="text-sm text-left text-emerald-700 dark:text-emerald-300 hover:underline"
                      onClick={() => setSelectedId(r.id)}
                    >
                      ✓ {r.label}
                    </button>
                  </li>
                ))}
                {!board.recentDone?.length ? (
                  <li className="text-xs text-slate-500">Pas encore de tâche OK.</li>
                ) : null}
              </ul>
            </Accordion>

            {canWrite ? (
              <Card className="p-4">
                <p className="text-sm font-semibold mb-2">Nouvelle tâche</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="flex-1 min-w-[12rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm"
                    placeholder="Libellé (ex. Fix CORS LAN)"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!newLabel.trim() || actionMut.isPending}
                    className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                    onClick={() => {
                      actionMut.mutate({
                        type: 'create',
                        itemId: '',
                        note: newLabel.trim(),
                        cycleId: 'cycle-now',
                      })
                      setNewLabel('')
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              </Card>
            ) : null}
          </div>

          <div className="xl:col-span-2">
            {selected ? (
              <TaskDetail
                key={selected.id}
                task={selected}
                canWrite={canWrite}
                cycles={(board.cycles || []).map((c) => ({ id: c.id, label: c.label }))}
                busy={actionMut.isPending}
                onAction={(payload) => actionMut.mutate(payload)}
              />
            ) : (
              <Card className="p-6 text-sm text-slate-500">Sélectionne une tâche pour valider.</Card>
            )}
          </div>
        </div>
      ) : null}
    </PageLayout>
  )
}
