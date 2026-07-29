import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  FolderSync,
  AlertTriangle,
  Container,
  X,
} from 'lucide-react'
import { useAuth } from '../../authContext'
import {
  fetchPilotageBoard,
  fetchPilotageOpsSignals,
  fetchPilotageMobileCrashDetail,
  postPilotageAction,
  syncPilotageDocs,
  type PilotageActionPayload,
  type PilotageBoard,
  type PilotageRelease,
  type PilotageTask,
  type PilotageTaskStatus,
} from '../../api'
import { Link } from 'react-router-dom'
import { Card, PageLayout } from '@cloudity/ui'
import { ApiError, adminUiPath } from '@cloudity/shared'

const STATUS_LABELS: Record<string, string> = {
  open: 'À faire',
  in_progress: 'En cours',
  waiting: 'En attente',
  partial: 'Partiel',
  to_validate: 'À valider',
  ok: 'Validé',
  recheck: 'À re-vérifier',
  rework: 'À corriger',
  ko: 'KO',
  tested: 'Testée',
  to_test_prod: 'À tester en prod',
  prod_ok: 'Prod validée',
  done: 'Terminée',
  blocked: 'Bloqué',
  deferred: 'Plus tard',
}

const DEFAULT_DECISIONS: { status: string; decision: string; label: string; group: string }[] = [
  { status: 'open', decision: 'A_FAIRE', label: 'À faire', group: 'travail' },
  { status: 'in_progress', decision: 'EN_COURS', label: 'En cours', group: 'travail' },
  { status: 'waiting', decision: 'EN_ATTENTE', label: 'En attente', group: 'travail' },
  { status: 'partial', decision: 'PARTIEL', label: 'Partiel', group: 'travail' },
  { status: 'to_validate', decision: 'A_VALIDER', label: 'À valider', group: 'validation' },
  { status: 'ok', decision: 'OK', label: 'Validé', group: 'validation' },
  { status: 'recheck', decision: 'A_REVERIFIER', label: 'À re-vérifier', group: 'validation' },
  { status: 'rework', decision: 'A_CORRIGER', label: 'À corriger', group: 'validation' },
  { status: 'ko', decision: 'KO', label: 'KO', group: 'validation' },
  { status: 'tested', decision: 'TESTEE', label: 'Testée', group: 'tests' },
  { status: 'to_test_prod', decision: 'A_TESTER_PROD', label: 'À tester en prod', group: 'tests' },
  { status: 'prod_ok', decision: 'PROD_OK', label: 'Prod validée', group: 'tests' },
  { status: 'done', decision: 'TERMINEE', label: 'Terminée', group: 'cloture' },
  { status: 'blocked', decision: 'BLOQUE', label: 'Bloqué', group: 'cloture' },
  { status: 'deferred', decision: 'PLUS_TARD', label: 'Plus tard', group: 'cloture' },
]

const GROUP_LABELS: Record<string, string> = {
  travail: 'Travail',
  validation: 'Validation',
  tests: 'Tests',
  cloture: 'Clôture',
}

const SURFACE_ORDER = [
  { key: 'backend', fallback: 'Backend API' },
  { key: 'frontend_web', fallback: 'Frontend web' },
  { key: 'backoffice', fallback: 'Back-office' },
  { key: 'mobile', fallback: 'Mobile' },
] as const

/** Critères H14-like : LAN (1/2/3a) vs HTTPS (3b). */
function criterionLane(label: string): 'lan' | 'https' | 'other' {
  const t = label.trim().toLowerCase()
  if (/^3b[.\s)]/.test(t) || t.includes('https vps') || t.includes('via zoneforge')) return 'https'
  if (
    /^(1[.\s)]|2[.\s)]|3a[.\s)])/.test(t) ||
    t.includes('smoke lan') ||
    t.includes('sync-public') ||
    (t.includes('run-mobile') && !t.includes('https'))
  ) {
    return 'lan'
  }
  return 'other'
}

const QUICK_DECISIONS = [
  { decision: 'EN_COURS', label: 'En cours', status: 'in_progress' },
  { decision: 'PARTIEL', label: 'Partiel', status: 'partial' },
  { decision: 'A_VALIDER', label: 'À valider', status: 'to_validate' },
  { decision: 'PLUS_TARD', label: 'Plus tard', status: 'deferred' },
] as const

function statusClass(status: PilotageTaskStatus | string): string {
  switch (status) {
    case 'ok':
    case 'done':
    case 'prod_ok':
    case 'tested':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
    case 'ko':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
    case 'rework':
    case 'recheck':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
    case 'blocked':
      return 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100'
    case 'partial':
    case 'waiting':
    case 'to_test_prod':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
    case 'to_validate':
      return 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100'
    case 'in_progress':
      return 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100'
    case 'deferred':
      return 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
    default:
      return 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
  }
}

function statusLabel(status: PilotageTaskStatus | string): string {
  return STATUS_LABELS[status] || status || 'À faire'
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
  isActive,
  onSelect,
}: {
  task: PilotageTask
  selected: boolean
  isActive: boolean
  onSelect: () => void
}) {
  const done = task.checklist.filter((c) => c.done).length
  const total = task.checklist.length
  const remaining = total - done
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-brand-400 bg-brand-50/60 dark:border-brand-600 dark:bg-brand-950/30'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {task.kind === 'problem' ? '⚠ ' : task.kind === 'gate' ? '☑ ' : ''}
              {task.label}
            </p>
            {isActive && task.status === 'in_progress' ? (
              <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                EN COURS
              </span>
            ) : isActive ? (
              <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-slate-500">
                FOCUS
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {task.section}
            {task.parentId ? ` · parent ${task.parentId}` : null}
            {total > 0
              ? remaining > 0
                ? ` · Reste ${remaining}`
                : ` · ${done}/${total} critères`
              : null}
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
  isEnCours,
  decisionsCatalog,
  onAction,
  onClose,
}: {
  task: PilotageTask
  canWrite: boolean
  cycles: { id: string; label: string }[]
  busy: boolean
  isEnCours: boolean
  decisionsCatalog?: { status: string; decision: string; label: string; group: string }[]
  onAction: (payload: PilotageActionPayload) => void
  onClose: () => void
}) {
  const [note, setNote] = useState(task.porteurNote || task.completionNote || '')
  const [problemText, setProblemText] = useState('')
  const [logPaste, setLogPaste] = useState('')
  const [showGuide, setShowGuide] = useState(true)
  const [showAllDecisions, setShowAllDecisions] = useState(false)

  const remainingCriteria = task.checklist.filter((c) => !c.done).length
  const lanItems = task.checklist.filter((c) => criterionLane(c.label) === 'lan')
  const httpsItems = task.checklist.filter((c) => criterionLane(c.label) === 'https')
  const otherItems = task.checklist.filter((c) => criterionLane(c.label) === 'other')
  const lanPending = lanItems.filter((c) => !c.done)
  const hasLanSplit = lanItems.length > 0 && (httpsItems.length > 0 || otherItems.length > 0)

  const decisions = decisionsCatalog?.length ? decisionsCatalog : DEFAULT_DECISIONS
  const decisionGroups = useMemo(() => {
    const order = ['travail', 'validation', 'tests', 'cloture']
    const byGroup = new Map<string, typeof decisions>()
    for (const d of decisions) {
      const list = byGroup.get(d.group) || []
      list.push(d)
      byGroup.set(d.group, list)
    }
    return order
      .filter((g) => byGroup.has(g))
      .map((g) => ({ group: g, label: GROUP_LABELS[g] || g, items: byGroup.get(g)! }))
  }, [decisions])

  const surfaceEntries = task.surfaces
    ? SURFACE_ORDER.map((s) => ({
        key: s.key,
        label: task.surfaces![s.key]?.label || s.fallback,
        done: Boolean(task.surfaces![s.key]?.done),
      }))
    : []

  const renderCriterion = (c: { id: string; label: string; done: boolean }) => (
    <li key={c.id} className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
        checked={c.done}
        disabled={!canWrite}
        onChange={(e) =>
          onAction({
            type: 'checklist',
            itemId: task.id,
            checklistItemId: c.id,
            done: e.target.checked,
          })
        }
      />
      <button
        type="button"
        disabled={!canWrite}
        className={`text-left text-sm ${c.done ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'} disabled:opacity-60`}
        onClick={() =>
          onAction({
            type: 'checklist',
            itemId: task.id,
            checklistItemId: c.id,
            done: !c.done,
          })
        }
      >
        {c.label}
      </button>
    </li>
  )

  return (
    <div className="sticky top-4 flex max-h-[calc(100vh-5.5rem)] flex-col">
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
        <div>
          <p className="text-xs font-mono text-slate-500">
            {task.id}
            {task.kind ? ` · ${task.kind}` : ''}
            {task.parentId ? ` · ← ${task.parentId}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{task.label}</h2>
            {isEnCours && task.status === 'in_progress' ? (
              <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                EN COURS
              </span>
            ) : isEnCours ? (
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-slate-500">
                FOCUS
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusClass(task.status)}`}>
            {statusLabel(task.status)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            title="Fermer le détail"
            aria-label="Fermer le détail"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
      {task.status === 'blocked' && (task.blockedBy?.length ?? 0) > 0 ? (
        <div className="mb-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-3 text-sm text-orange-900 dark:text-orange-100">
          Bloqué par : {(task.blockedBy || []).join(', ')}. Traite d’abord le problème, puis reprends.
        </div>
      ) : null}

      {task.expected ? (
        <div className="mb-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Attendu</p>
          <p className="text-sm text-slate-800 dark:text-slate-200">{task.expected}</p>
        </div>
      ) : null}

      {!canWrite ? (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Lecture seule — les cases et décisions sont désactivées (écriture pilotage off pour cet
          environnement).
        </p>
      ) : null}

      {canWrite ? (
        <div className="mb-4 rounded-lg border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 p-3">
          <p className="mb-2 text-xs font-semibold text-indigo-900 dark:text-indigo-100">
            Décision rapide
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_DECISIONS.map((d) => {
              const active = d.status === task.status
              return (
                <button
                  key={d.decision}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onAction({ type: 'decide', itemId: task.id, decision: d.decision, note })
                  }
                  className={`rounded-lg px-3 py-2 text-sm font-semibold border disabled:opacity-50 ${
                    active
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-900 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/40'
                  }`}
                >
                  {d.label}
                </button>
              )
            })}
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ type: 'set_focus', itemId: task.id })}
              className="rounded-lg px-3 py-2 text-sm font-semibold border border-slate-300 dark:border-slate-600"
            >
              Focus
            </button>
          </div>
          {lanItems.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onAction({
                  type: 'checklist_bulk',
                  itemId: task.id,
                  checklistItemIds: lanItems.map((c) => c.id),
                  done: true,
                  decision: 'PARTIEL',
                  note: note || 'LAN OK — HTTPS plus tard',
                })
              }
              className="mt-2 w-full rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {lanPending.length > 0
                ? `Cocher LAN (${lanPending.length}) → Partiel`
                : 'Rester / confirmer Partiel (LAN)'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Critères</p>
          {task.checklist.length > 0 ? (
            <p className="text-xs text-slate-500">
              {task.checklist.length - remainingCriteria}/{task.checklist.length} · reste{' '}
              {remainingCriteria}
            </p>
          ) : null}
        </div>
        {hasLanSplit ? (
          <div className="space-y-3">
            {lanItems.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  LAN (→ Partiel)
                </p>
                <ul className="space-y-2">{lanItems.map(renderCriterion)}</ul>
              </div>
            ) : null}
            {httpsItems.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  HTTPS / VPS (plus tard)
                </p>
                <ul className="space-y-2">{httpsItems.map(renderCriterion)}</ul>
              </div>
            ) : null}
            {otherItems.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Autres
                </p>
                <ul className="space-y-2">{otherItems.map(renderCriterion)}</ul>
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2">
            {task.checklist.map(renderCriterion)}
            {task.checklist.length === 0 ? (
              <li className="text-xs text-slate-500">Aucun critère.</li>
            ) : null}
          </ul>
        )}
      </div>

      {(task.howToSteps?.length || task.docLinks?.length || task.description) ? (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/40">
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-900/50"
            onClick={() => setShowGuide((v) => !v)}
          >
            {showGuide ? '▾ Guide / docs (replier)' : '▸ Guide / docs (déplier)'}
            <span className="ml-2 font-normal text-slate-500">
              — scroll dans ce panneau pour tout lire
            </span>
          </button>
          {showGuide ? (
            <div className="space-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
              {task.description ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {task.description}
                </p>
              ) : null}
              {task.howToSteps && task.howToSteps.length > 0 ? (
                <ol className="space-y-2">
                  {task.howToSteps.map((step, i) => (
                    <li
                      key={`${step.title}-${i}`}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 p-3"
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {i + 1}. {step.title}
                      </p>
                      {step.body ? (
                        <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          {step.body}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              {task.docLinks && task.docLinks.length > 0 ? (
                <ul className="space-y-1">
                  {task.docLinks.map((link) => (
                    <li key={link}>
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 break-all">
                        {link}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <label className="block mb-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</span>
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          rows={2}
          value={note}
          disabled={!canWrite}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (canWrite && note !== (task.porteurNote || task.completionNote || '')) {
              onAction({ type: 'note', itemId: task.id, note })
            }
          }}
        />
      </label>

      {surfaceEntries.length > 0 ? (
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Surfaces</p>
          <ul className="space-y-2">
            {surfaceEntries.map((s) => (
              <li key={s.key} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-indigo-600"
                  checked={s.done}
                  disabled={!canWrite}
                  onChange={(e) =>
                    onAction({
                      type: 'surface',
                      itemId: task.id,
                      surfaceKey: s.key,
                      done: e.target.checked,
                    })
                  }
                />
                <span
                  className={`text-sm ${s.done ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}`}
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canWrite ? (
        <>
          <button
            type="button"
            className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline"
            onClick={() => setShowAllDecisions((v) => !v)}
          >
            {showAllDecisions ? 'Masquer toutes les décisions' : 'Toutes les décisions…'}
          </button>
          {showAllDecisions ? (
            <div className="mb-3 space-y-3">
              {decisionGroups.map((g) => (
                <div key={g.group}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {g.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {g.items.map((d) => {
                      const active = d.status === task.status
                      return (
                        <button
                          key={d.decision}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            onAction({
                              type: 'decide',
                              itemId: task.id,
                              decision: d.decision,
                              note,
                            })
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border disabled:opacity-50 ${
                            active
                              ? 'border-indigo-500 bg-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-700'
                              : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {task.kind === 'problem' ? (
            <button
              type="button"
              disabled={busy}
              className="mb-3 w-full rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
              onClick={() => onAction({ type: 'resolve_problem', itemId: task.id, note })}
            >
              Problème résolu → reprendre le parent
            </button>
          ) : (
            <div className="mb-3 rounded-lg border border-orange-200 dark:border-orange-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-orange-800 dark:text-orange-200 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Signaler un problème (bloque cette tâche)
              </p>
              <textarea
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm"
                rows={2}
                placeholder="Ex. CORS bloque login mobile HTTPS…"
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !problemText.trim()}
                className="rounded-lg bg-orange-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                onClick={() => {
                  onAction({
                    type: 'report_problem',
                    itemId: task.id,
                    note: problemText.trim(),
                    logText: logPaste.trim() || undefined,
                    logSource: logPaste.trim() ? 'manual' : undefined,
                  })
                  setProblemText('')
                }}
              >
                Créer problème + bloquer
              </button>
            </div>
          )}

          <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Coller un log (mobile / conteneur)</p>
            <textarea
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-xs font-mono"
              rows={3}
              placeholder="logcat / flutter / docker logs…"
              value={logPaste}
              onChange={(e) => setLogPaste(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !logPaste.trim()}
              className="rounded-lg border px-3 py-1.5 text-xs dark:border-slate-600 disabled:opacity-50"
              onClick={() => {
                onAction({
                  type: 'attach_log',
                  itemId: task.id,
                  note: logPaste.trim(),
                  logSource: 'paste',
                })
                setLogPaste('')
              }}
            >
              Attacher à cette tâche
            </button>
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

      {task.logSnippets?.length ? (
        <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3">
          <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Logs attachés</p>
          <ul className="space-y-2 max-h-40 overflow-auto">
            {task.logSnippets.slice(0, 5).map((s, i) => (
              <li key={`${s.at}-${i}`} className="rounded bg-slate-50 dark:bg-slate-800/60 p-2">
                <p className="text-[10px] text-slate-500 font-mono mb-1">
                  {s.at.slice(0, 19)} · {s.source}
                </p>
                <pre className="text-[10px] whitespace-pre-wrap font-mono text-slate-700 dark:text-slate-300 max-h-24 overflow-auto">
                  {s.text.slice(0, 1200)}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
      </div>
    </Card>
    </div>
  )
}

function ReleaseRow({
  release,
  selected,
  onSelect,
}: {
  release: PilotageRelease
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-brand-400 bg-brand-50/60 dark:border-brand-600 dark:bg-brand-950/30'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{release.label}</p>
          {release.summary ? (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{release.summary}</p>
          ) : null}
          {release.features?.length ? (
            <p className="text-[11px] text-slate-500 mt-1 truncate">{release.features.join(' · ')}</p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusClass(release.status)}`}>
          {statusLabel(release.status)}
        </span>
      </div>
    </button>
  )
}

function ReleaseDetail({
  release,
  canWrite,
  busy,
  decisionsCatalog,
  onAction,
  onClose,
}: {
  release: PilotageRelease
  canWrite: boolean
  busy: boolean
  decisionsCatalog?: { status: string; decision: string; label: string; group: string }[]
  onAction: (payload: PilotageActionPayload) => void
  onClose: () => void
}) {
  const decisions = decisionsCatalog?.length ? decisionsCatalog : DEFAULT_DECISIONS
  const decisionGroups = useMemo(() => {
    const order = ['travail', 'validation', 'tests', 'cloture']
    const byGroup = new Map<string, typeof decisions>()
    for (const d of decisions) {
      const list = byGroup.get(d.group) || []
      list.push(d)
      byGroup.set(d.group, list)
    }
    return order
      .filter((g) => byGroup.has(g))
      .map((g) => ({ group: g, label: GROUP_LABELS[g] || g, items: byGroup.get(g)! }))
  }, [decisions])

  return (
    <Card className="p-4 sm:p-5 sticky top-4 max-h-[calc(100vh-6rem)] overflow-auto">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-mono text-slate-500">{release.id} · release</p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{release.label}</h2>
        </div>
        <div className="flex items-start gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusClass(release.status)}`}>
            {statusLabel(release.status)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            title="Fermer le détail"
            aria-label="Fermer le détail"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mb-3 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:underline"
      >
        Fermer le détail
      </button>

      {release.summary ? (
        <div className="mb-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Résumé</p>
          <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{release.summary}</p>
        </div>
      ) : null}

      {release.features?.length ? (
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Fonctionnalités</p>
          <ul className="space-y-1.5">
            {release.features.map((f) => (
              <li key={f} className="text-sm text-slate-700 dark:text-slate-300 flex gap-2">
                <span className="text-slate-400">·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {release.note ? (
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{release.note}</p>
      ) : null}

      {canWrite ? (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-500">Statut de la version</p>
          {decisionGroups.map((g) => (
            <div key={g.group}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((d) => {
                  const active = d.status === release.status
                  return (
                    <button
                      key={d.decision}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onAction({
                          type: 'release_status',
                          itemId: release.id,
                          releaseId: release.id,
                          status: d.status,
                        })
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold border disabled:opacity-50 ${
                        active
                          ? 'border-indigo-500 bg-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-700'
                          : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-300">Lecture seule.</p>
      )}
    </Card>
  )
}

export default function PilotagePage() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  /** undefined = auto-sélection active au 1er chargement ; null = panneau fermé ; string = choix explicite */
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined)
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, boolean | undefined>>({
    now: true,
    problems: true,
    preprod: true,
    releases: true,
    inbox: true,
    ops: false,
    cycles: false,
    done: false,
    recent: false,
  })
  const [statusFilter, setStatusFilter] = useState<'all' | PilotageTaskStatus>('all')
  const [flash, setFlash] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [inboxText, setInboxText] = useState('')
  const [inboxKind, setInboxKind] = useState('problem')

  const selectTask = (id: string | null) => {
    setSelectedReleaseId(null)
    setSelectedId(id)
  }

  const selectRelease = (id: string | null) => {
    setSelectedId(null)
    setSelectedReleaseId(id)
  }

  const dismissPanel = () => {
    setSelectedId(null)
    setSelectedReleaseId(null)
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['pilotage-board'],
    queryFn: () => fetchPilotageBoard(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 60_000,
  })

  const opsQuery = useQuery({
    queryKey: ['pilotage-ops'],
    queryFn: () => fetchPilotageOpsSignals(accessToken!),
    enabled: Boolean(accessToken) && openSections.ops === true,
    staleTime: 30_000,
  })

  const actionMut = useMutation({
    mutationFn: (payload: PilotageActionPayload) => postPilotageAction(accessToken!, payload),
    onSuccess: (res, variables) => {
      queryClient.setQueryData(['pilotage-board'], res)
      setFlash(res.message || 'Mis à jour')
      // Ne pas voler la sélection sur checklist / Partiel — seulement focus / problème.
      const jumpFocus =
        variables.type === 'set_focus' ||
        variables.type === 'report_problem' ||
        variables.type === 'resolve_problem' ||
        (variables.type === 'decide' && variables.decision === 'EN_COURS') ||
        (variables.type === 'checklist_bulk' && variables.decision === 'EN_COURS')
      if (jumpFocus && res.board?.focusTaskId) {
        setSelectedReleaseId(null)
        setSelectedId(res.board.focusTaskId)
      } else if (variables.itemId && selectedId === null) {
        setSelectedId(variables.itemId)
      }
      window.setTimeout(() => setFlash(null), 3500)
    },
  })

  const syncMut = useMutation({
    mutationFn: () => syncPilotageDocs(accessToken!),
    onSuccess: (res) => {
      queryClient.setQueryData(['pilotage-board'], res)
      setFlash(res.message || 'Sync docs OK')
      window.setTimeout(() => setFlash(null), 5000)
    },
  })

  const board: PilotageBoard | undefined = data?.board
  const canWrite = Boolean(data?.canWrite)

  // Auto-sélection uniquement tant que selectedId est undefined (jamais après fermeture → null)
  useEffect(() => {
    if (selectedId !== undefined) return
    if (!board) return
    if (board.active?.id) setSelectedId(board.active.id)
    else if (board.focusTaskId) setSelectedId(board.focusTaskId)
  }, [board, selectedId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selected = useMemo(() => {
    if (!board?.tasks) return null
    if (selectedId === null || selectedId === undefined) return null
    return board.tasks[selectedId] || null
  }, [board, selectedId])

  const selectedRelease = useMemo(() => {
    if (!board?.releases || !selectedReleaseId) return null
    return board.releases.find((r) => r.id === selectedReleaseId) || null
  }, [board, selectedReleaseId])

  const enCoursId = board?.active?.id || board?.focusTaskId || null
  const isEnCoursSelected = Boolean(
    selected && enCoursId && (selected.id === board?.active?.id || selected.id === board?.focusTaskId)
  )

  const cycleViews = board?.cycleViews || []
  const nowCycle = cycleViews.find((c) => c.id === 'cycle-now')
  const preprodCycle = cycleViews.find((c) => c.id === 'cycle-preprod')
  const doneCycle = cycleViews.find((c) => c.id === 'cycle-done')
  const otherCycles = cycleViews.filter(
    (c) => c.id !== 'cycle-now' && c.id !== 'cycle-preprod' && c.id !== 'cycle-done'
  )

  const tasksFor = (ids: string[]) =>
    (ids.map((id) => board?.tasks[id]).filter(Boolean) as PilotageTask[]).filter(
      (t) => statusFilter === 'all' || t.status === statusFilter
    )

  const preprodTotal = board?.preprodProgress?.total ?? preprodCycle?.total ?? 0

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
      description="Suivre docs/operations/SUIVRE-ICI.md — valider dans ce board (H14)."
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
              {board?.preprodProgress ? (
                <span className="ml-2 text-slate-500">
                  · Pré-prod {board.preprodProgress.progressLabel}
                </span>
              ) : null}
            </p>
            {board?.active ? (
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectTask(board.active!.id)}
                  className="text-left rounded-md px-1.5 py-0.5 -ml-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Focus : <strong>{board.active.label}</strong>
                </button>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass(board.active.status || 'open')}`}
                >
                  {(board.active as { statusLabel?: string }).statusLabel ||
                    statusLabel(board.active.status || 'open')}
                </span>
                {board.active.status === 'in_progress' ? (
                  <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    EN COURS
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    (tête de file — statut ci-contre, pas « En cours »)
                  </span>
                )}
                {board.active.kind === 'problem' ? (
                  <span className="text-orange-700 dark:text-orange-300">(problème — prioritaire)</span>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-slate-500">Aucune tâche workable dans le cycle immédiat.</p>
            )}
            {board?.blockedHint ? (
              <p className="mt-1 text-orange-700 dark:text-orange-300 text-xs">
                {board.blockedHint.label} est bloqué — {board.blockedHint.resumeHint}
              </p>
            ) : null}
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending || !canWrite}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            title="Recharge pilotage-catalog.json + statuts TODOS/BACKLOG"
          >
            <FolderSync className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
            Sync docs
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-slate-500">Chargement du tableau…</p>
      ) : error ? (
        <Card className="p-4 text-red-600">
          {error instanceof ApiError ? error.message : 'Impossible de charger le board.'}
        </Card>
      ) : board ? (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div
            className="xl:col-span-3 space-y-3"
            onClick={() => dismissPanel()}
          >
            {board.counts ? (
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                {board.active ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2">
                    <span className="font-semibold">Focus</span> = tête de file (
                    <button
                      type="button"
                      className="underline underline-offset-2 font-medium"
                      onClick={() => selectTask(board.active!.id)}
                    >
                      {board.active.id}
                    </button>
                    ,{' '}
                    <span className={statusClass(board.active.status)}>
                      {board.active.statusLabel || statusLabel(board.active.status)}
                    </span>
                    ). Les pastilles ci-dessous comptent par <strong>statut</strong> sur tout le
                    catalogue — « En cours » = 0 tant que personne n’a cliqué la décision{' '}
                    <em>En cours</em> (Partiel / À faire ≠ En cours).
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 text-xs items-center">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-full px-2.5 py-1 font-medium border ${
                    statusFilter === 'all' ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40' : 'border-transparent'
                  }`}
                >
                  Toutes {board.counts.total ?? 0}
                </button>
                {(
                  [
                    'open',
                    'in_progress',
                    'partial',
                    'to_validate',
                    'recheck',
                    'blocked',
                    'ok',
                    'ko',
                    'deferred',
                  ] as const
                ).map((k) => {
                  const n = board.counts?.[k] ?? 0
                  if (n === 0 && k !== 'in_progress' && statusFilter !== k) return null
                  return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStatusFilter(k)}
                    title={
                      k === 'in_progress'
                        ? 'Statut « En cours » uniquement (décision En cours). La Focus peut être Partiel.'
                        : k === 'open'
                          ? 'Tâches jamais démarrées (catalogue). Filtre, pas la file « À faire maintenant ».'
                          : undefined
                    }
                    className={`rounded-full px-2.5 py-1 font-medium ${statusClass(k)} ${
                      statusFilter === k ? 'ring-2 ring-offset-1 ring-slate-400' : ''
                    } ${n === 0 ? 'opacity-50' : ''}`}
                  >
                    {statusLabel(k)} {n}
                  </button>
                  )
                })}
                </div>
              </div>
            ) : null}

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="À faire maintenant (ordre)"
                count={nowCycle?.total}
                open={openSections.now !== false}
                onToggle={() => setOpenSections((s) => ({ ...s, now: !s.now }))}
              >
                <p className="text-xs text-slate-500 mb-2">
                  File de travail (ordre). Le badge <strong>FOCUS</strong> = tête de file ;
                  le statut (Partiel / En cours / …) est indépendant. Les pastilles du haut
                  filtrent tout le catalogue (101 « À faire » = jamais démarrées ailleurs).
                </p>
                <div className="space-y-2">
                  {tasksFor(nowCycle?.itemIds || []).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      selected={selected?.id === t.id}
                      isActive={t.id === board.active?.id}
                      onSelect={() => selectTask(t.id)}
                    />
                  ))}
                </div>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="À valider"
                count={board.toValidate?.length}
                open={openSections.toValidate ?? (board.toValidate?.length ?? 0) > 0}
                onToggle={() =>
                  setOpenSections((s) => ({
                    ...s,
                    toValidate: !(s.toValidate ?? (board.toValidate?.length ?? 0) > 0),
                  }))
                }
              >
                <ul className="space-y-2">
                  {(board.toValidate || []).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-left dark:border-violet-800 dark:bg-violet-950/20"
                        onClick={() => selectTask(item.id)}
                      >
                        <span className="text-sm text-slate-900 dark:text-slate-100">{item.label}</span>
                        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {!board.toValidate?.length ? (
                    <li className="text-xs text-slate-500">Rien à valider pour le moment.</li>
                  ) : null}
                </ul>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="Problèmes ouverts"
                count={board.openProblems?.length}
                open={openSections.problems !== false}
                onToggle={() => setOpenSections((s) => ({ ...s, problems: !s.problems }))}
              >
                <ul className="space-y-2">
                  {(board.openProblems || []).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="text-sm text-left text-orange-800 dark:text-orange-200 hover:underline"
                        onClick={() => selectTask(p.id)}
                      >
                        ⚠ {p.label}
                        {p.parentId ? ` (bloque ${p.parentId})` : ''}
                      </button>
                    </li>
                  ))}
                  {!board.openProblems?.length ? (
                    <li className="text-xs text-slate-500">Aucun problème ouvert.</li>
                  ) : null}
                </ul>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="Pré-prod — revalidation complète"
                count={preprodCycle?.total}
                open={openSections.preprod !== false}
                onToggle={() => setOpenSections((s) => ({ ...s, preprod: !s.preprod }))}
              >
                <p className="text-xs text-slate-500 mb-2">
                  Checklist ordonnée avant prod complète (apps, HTTPS, DNS, tests).{' '}
                  {board.preprodProgress?.progressLabel}
                </p>
                {preprodTotal === 0 ? (
                  <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                    Clique Sync docs pour charger PREPROD-01…10 (checklist avant prod)
                  </p>
                ) : null}
                <div className="space-y-2">
                  {tasksFor(preprodCycle?.itemIds || []).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      selected={selected?.id === t.id}
                      isActive={t.id === board.active?.id}
                      onSelect={() => selectTask(t.id)}
                    />
                  ))}
                </div>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="Versions / releases"
                count={board.releases?.length}
                open={openSections.releases !== false}
                onToggle={() => setOpenSections((s) => ({ ...s, releases: !s.releases }))}
              >
                <div className="space-y-2">
                  {(board.releases || []).map((rel) => (
                    <ReleaseRow
                      key={rel.id}
                      release={rel}
                      selected={selectedRelease?.id === rel.id}
                      onSelect={() => selectRelease(rel.id)}
                    />
                  ))}
                  {!board.releases?.length ? (
                    <p className="text-xs text-slate-500">Aucune version.</p>
                  ) : null}
                </div>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="Inbox — problèmes / logs à la volée"
                count={board.inbox?.filter((i) => !i.promoted).length}
                open={openSections.inbox !== false}
                onToggle={() => setOpenSections((s) => ({ ...s, inbox: !s.inbox }))}
              >
                {canWrite ? (
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs px-2 py-1"
                        value={inboxKind}
                        onChange={(e) => setInboxKind(e.target.value)}
                      >
                        <option value="problem">Problème</option>
                        <option value="mobile_log">Log mobile</option>
                        <option value="container_log">Log conteneur</option>
                        <option value="test">Note test</option>
                      </select>
                    </div>
                    <textarea
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Noter un souci vu pendant un test (sera revu avant prod)…"
                      value={inboxText}
                      onChange={(e) => setInboxText(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!inboxText.trim() || actionMut.isPending}
                      className="rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      onClick={() => {
                        actionMut.mutate({
                          type: 'inbox_note',
                          itemId: selected?.id || '',
                          note: inboxText.trim(),
                          kind: inboxKind,
                        })
                        setInboxText('')
                      }}
                    >
                      Ajouter à l’inbox
                    </button>
                  </div>
                ) : null}
                <ul className="space-y-2 max-h-56 overflow-auto">
                  {(board.inbox || [])
                    .filter((i) => !i.promoted)
                    .slice(0, 20)
                    .map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-xs"
                      >
                        <p className="font-mono text-[10px] text-slate-500">
                          {item.at.slice(0, 19)} · {item.kind}
                        </p>
                        <p className="mt-1 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                          {item.text.slice(0, 400)}
                        </p>
                        {canWrite ? (
                          <button
                            type="button"
                            className="mt-1 text-indigo-600 dark:text-indigo-300 hover:underline"
                            disabled={actionMut.isPending}
                            onClick={() =>
                              actionMut.mutate({
                                type: 'promote_inbox',
                                itemId: item.id,
                                inboxId: item.id,
                                parentId: selected?.id,
                              })
                            }
                          >
                            Promouvoir en problème / tâche
                          </button>
                        ) : null}
                      </li>
                    ))}
                  {!board.inbox?.filter((i) => !i.promoted).length ? (
                    <li className="text-xs text-slate-500">Inbox vide.</li>
                  ) : null}
                </ul>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="Signaux ops (conteneurs + crashes mobile)"
                count={opsQuery.data?.mobileCrashes?.length}
                open={Boolean(openSections.ops)}
                onToggle={() => setOpenSections((s) => ({ ...s, ops: !s.ops }))}
              >
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <Container className="w-4 h-4 text-slate-500" />
                  <button
                    type="button"
                    className="text-xs text-indigo-600 dark:text-indigo-300 hover:underline"
                    onClick={() => {
                      void opsQuery.refetch()
                    }}
                  >
                    Rafraîchir
                  </button>
                  <Link
                    to={adminUiPath('mobile-logs')}
                    className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
                  >
                    Voir tous les crashes →
                  </Link>
                </div>

                {opsQuery.data?.notes?.length ? (
                  <ul className="mb-3 space-y-1">
                    {opsQuery.data.notes.map((n, i) => (
                      <li key={`${n}-${i}`} className="text-xs text-slate-500">
                        {n}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Crashes mobile récents
                  </p>
                  {opsQuery.isLoading ? (
                    <p className="text-xs text-slate-500">Chargement crashes…</p>
                  ) : opsQuery.isError ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Impossible de charger les signaux ops.
                    </p>
                  ) : (opsQuery.data?.mobileCrashes?.length ?? 0) > 0 ? (
                    <ul className="space-y-2 max-h-48 overflow-auto">
                      {(opsQuery.data?.mobileCrashes || []).slice(0, 8).map((item) => (
                        <li
                          key={item.id}
                          className="rounded border border-slate-200 dark:border-slate-700 p-2 text-xs"
                        >
                          <p className="font-mono text-[10px] text-slate-500 truncate">{item.filename}</p>
                          <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                            {item.modified} · {(item.sizeBytes / 1024).toFixed(1)} Ko
                          </p>
                          {canWrite ? (
                            <div className="flex flex-wrap gap-2 mt-1">
                              <button
                                type="button"
                                className="text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline"
                                disabled={actionMut.isPending}
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      const detail = await fetchPilotageMobileCrashDetail(
                                        accessToken!,
                                        item.id
                                      )
                                      const text = JSON.stringify(detail, null, 2).slice(0, 6000)
                                      actionMut.mutate({
                                        type: 'inbox_note',
                                        itemId: selected?.id || board.active?.id || '',
                                        note: `Crash mobile ${item.filename}\n${text}`,
                                        kind: 'mobile_log',
                                      })
                                    } catch {
                                      actionMut.mutate({
                                        type: 'inbox_note',
                                        itemId: selected?.id || '',
                                        note: `Crash mobile ${item.id} (${item.filename}) — détail indisponible`,
                                        kind: 'mobile_log',
                                      })
                                    }
                                  })()
                                }}
                              >
                                → Inbox
                              </button>
                              {selected && selected.kind !== 'problem' ? (
                                <button
                                  type="button"
                                  className="text-[11px] text-orange-700 dark:text-orange-300 hover:underline"
                                  disabled={actionMut.isPending}
                                  onClick={() => {
                                    void (async () => {
                                      let logText = `Crash mobile ${item.filename} (${item.id})`
                                      try {
                                        const detail = await fetchPilotageMobileCrashDetail(
                                          accessToken!,
                                          item.id
                                        )
                                        logText = JSON.stringify(detail, null, 2).slice(0, 6000)
                                      } catch {
                                        /* keep short */
                                      }
                                      actionMut.mutate({
                                        type: 'report_problem',
                                        itemId: selected.id,
                                        note: `Crash mobile: ${item.filename}`,
                                        logText,
                                        logSource: 'mobile_crash',
                                      })
                                    })()
                                  }}
                                >
                                  → Problème (bloque tâche)
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : opsQuery.data ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                      <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100">
                        Aucun crash mobile — c’est normal.
                      </p>
                      <p className="mt-1 text-[11px] text-emerald-800/80 dark:text-emerald-200/80">
                        La liste reste vide tant qu’aucune app n’a posté de rapport. Ce n’est pas une
                        erreur de configuration.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Ouvre cette section pour charger les signaux.</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Logs conteneurs
                  </p>
                  {opsQuery.isLoading ? (
                    <p className="text-xs text-slate-500">Chargement…</p>
                  ) : opsQuery.data ? (
                    <div className="space-y-3">
                      {opsQuery.data.hint ? (
                        <p className="text-xs text-slate-500">{opsQuery.data.hint}</p>
                      ) : null}
                      {opsQuery.data.containers.map((c) => (
                        <div key={c.service} className="rounded border border-slate-200 dark:border-slate-700 p-2">
                          <p className="text-xs font-semibold">
                            {c.service}{' '}
                            <span className="font-normal text-slate-500">
                              {c.container || '—'} {c.ok ? '' : `(${c.error || 'ko'})`}
                            </span>
                          </p>
                          {c.errors?.length ? (
                            <pre className="mt-1 text-[10px] font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap max-h-28 overflow-auto">
                              {c.errors.join('\n')}
                            </pre>
                          ) : null}
                          {c.lines?.length ? (
                            <pre className="mt-1 text-[10px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-28 overflow-auto">
                              {c.lines.slice(-20).join('\n')}
                            </pre>
                          ) : !c.errors?.length ? (
                            <p className="mt-1 text-[11px] text-slate-500">Pas de lignes récentes.</p>
                          ) : null}
                          {canWrite && selected && (c.errors?.length || c.lines?.length) ? (
                            <button
                              type="button"
                              className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-300"
                              onClick={() =>
                                actionMut.mutate({
                                  type: 'attach_log',
                                  itemId: selected.id,
                                  note: (c.errors?.length ? c.errors : c.lines || []).join('\n'),
                                  logSource: `docker:${c.service}`,
                                })
                              }
                            >
                              Attacher à la tâche sélectionnée
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Ouvre cette section pour charger les logs.</p>
                  )}
                </div>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="Autres cycles"
                count={otherCycles.length}
                open={Boolean(openSections.cycles)}
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
                            isActive={t.id === board.active?.id}
                            onSelect={() => selectTask(t.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {!otherCycles.length ? (
                    <p className="text-xs text-slate-500">Aucun autre cycle.</p>
                  ) : null}
                </div>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <Accordion
                title="Terminées (référence)"
                count={doneCycle?.total}
                open={Boolean(openSections.done)}
                onToggle={() => setOpenSections((s) => ({ ...s, done: !s.done }))}
              >
                <div className="space-y-2">
                  {tasksFor(doneCycle?.itemIds || []).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      selected={selected?.id === t.id}
                      isActive={t.id === board.active?.id}
                      onSelect={() => selectTask(t.id)}
                    />
                  ))}
                  {!doneCycle?.itemIds?.length ? (
                    <p className="text-xs text-slate-500">Aucune tâche dans le cycle terminé.</p>
                  ) : null}
                </div>
              </Accordion>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
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
                        onClick={() => selectTask(r.id)}
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
            </div>

            {canWrite ? (
              <div onClick={(e) => e.stopPropagation()}>
                <Card className="p-4">
                  <p className="text-sm font-semibold mb-2">Nouvelle tâche</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="flex-1 min-w-[12rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm"
                      placeholder="Libellé"
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
              </div>
            ) : null}
          </div>

          <div className="xl:col-span-2" onClick={(e) => e.stopPropagation()}>
            {selected ? (
              <TaskDetail
                key={selected.id}
                task={selected}
                canWrite={canWrite}
                cycles={(board.cycles || []).map((c) => ({ id: c.id, label: c.label }))}
                busy={actionMut.isPending}
                isEnCours={isEnCoursSelected}
                decisionsCatalog={board.decisionsCatalog}
                onAction={(payload) => actionMut.mutate(payload)}
                onClose={dismissPanel}
              />
            ) : selectedRelease ? (
              <ReleaseDetail
                key={selectedRelease.id}
                release={selectedRelease}
                canWrite={canWrite}
                busy={actionMut.isPending}
                decisionsCatalog={board.decisionsCatalog}
                onAction={(payload) => actionMut.mutate(payload)}
                onClose={dismissPanel}
              />
            ) : (
              <Card className="p-6 text-sm text-slate-500">
                Sélectionne une tâche ou une version — ou ouvre le Focus
              </Card>
            )}
          </div>
        </div>
      ) : null}
    </PageLayout>
  )
}
