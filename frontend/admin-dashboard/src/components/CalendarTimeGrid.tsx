import React, { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListTodo, Trash2 } from 'lucide-react'
import type { CalendarEvent, Task, UserCalendar } from '../api'
import {
  assignTimeLanes,
  DEFAULT_PX_PER_HOUR,
  durationToHeight,
  localDayStartMs,
  minutesToY,
  MINUTES_PER_DAY,
  taskSegmentOnDay,
  timedEventSegmentOnDay,
} from '../lib/calendarTimeGrid'
import { dayKey, eventTouchesDay, sameDay } from '../lib/calendarGrid'

export type CalendarTimeGridProps = {
  days: Date[]
  events: CalendarEvent[] | null | undefined
  tasks: Task[] | null | undefined
  calMap: Map<number, UserCalendar>
  pxPerHour?: number
  onDeleteEvent: (id: number) => void
  onPickDay: (day: Date, minuteFromMidnight?: number) => void
}

function allDayEventsForDay(events: CalendarEvent[] | null | undefined, day: Date): CalendarEvent[] {
  return (events ?? []).filter((ev) => ev.all_day && eventTouchesDay(ev.start_at, ev.end_at, day))
}

function timedItemsForDay(
  events: CalendarEvent[] | null | undefined,
  tasks: Task[] | null | undefined,
  day: Date,
  calMap: Map<number, UserCalendar>
): { id: string; kind: 'event' | 'task'; startMin: number; endMin: number; title: string; color: string; eventId?: number; taskId?: number }[] {
  const out: {
    id: string
    kind: 'event' | 'task'
    startMin: number
    endMin: number
    title: string
    color: string
    eventId?: number
    taskId?: number
  }[] = []
  for (const ev of events ?? []) {
    const seg = timedEventSegmentOnDay(ev.start_at, ev.end_at, day, ev.all_day)
    if (!seg) continue
    const cal = ev.calendar_id != null ? calMap.get(ev.calendar_id) : undefined
    out.push({
      id: `e-${ev.id}`,
      kind: 'event',
      ...seg,
      title: ev.title,
      color: cal?.color_hex ?? '#1a73e8',
      eventId: ev.id,
    })
  }
  for (const t of tasks ?? []) {
    const seg = taskSegmentOnDay(t.due_at, day, t.completed)
    if (!seg) continue
    out.push({
      id: `t-${t.id}`,
      kind: 'task',
      ...seg,
      title: t.title,
      color: '#188038',
      taskId: t.id,
    })
  }
  return out
}

export default function CalendarTimeGrid({
  days,
  events,
  tasks,
  calMap,
  pxPerHour = DEFAULT_PX_PER_HOUR,
  onDeleteEvent,
  onPickDay,
}: CalendarTimeGridProps) {
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalH = 24 * pxPerHour

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    const h = now.getHours()
    const target = Math.max(0, (h - 1) * pxPerHour)
    el.scrollTop = target
  }, [days, pxPerHour])

  const now = new Date()
  const nowMs = now.getTime()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="grid shrink-0 border-b border-[#dadce0] bg-[#f8f9fa] dark:border-slate-600 dark:bg-slate-800/90"
        style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="flex items-center justify-end pr-1 py-1 text-[10px] font-medium uppercase tracking-wide text-[#5f6368] dark:text-slate-500">
          Journée
        </div>
        {days.map((day) => {
          const ads = allDayEventsForDay(events, day)
          return (
            <div key={dayKey(day)} className="min-h-[2rem] border-l border-[#dadce0] px-0.5 py-0.5 dark:border-slate-600">
              <div className="flex flex-wrap gap-0.5">
                {ads.map((ev) => {
                  const cal = ev.calendar_id != null ? calMap.get(ev.calendar_id) : undefined
                  return (
                    <span
                      key={ev.id}
                      className="max-w-full truncate rounded border-l-[3px] px-1 py-0.5 text-left text-[10px] font-medium text-white"
                      style={{ backgroundColor: cal?.color_hex ?? '#1a73e8', borderLeftColor: 'rgba(255,255,255,0.35)' }}
                      title={ev.title}
                    >
                      {ev.title}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex" style={{ minHeight: totalH }}>
          <div
            className="sticky left-0 z-10 w-[52px] shrink-0 border-r border-[#dadce0] bg-white dark:border-slate-600 dark:bg-slate-900"
            style={{ height: totalH }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="box-border flex justify-end border-t border-transparent pr-1 pt-0 text-[10px] leading-none text-[#70757a] dark:text-slate-500"
                style={{ height: pxPerHour }}
              >
                {h === 0 ? '0:00' : `${h} h`}
              </div>
            ))}
          </div>

          <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, height: totalH }}>
            {days.map((day) => {
              const raw = timedItemsForDay(events, tasks, day, calMap)
              const laid = assignTimeLanes(raw)
              const isToday = sameDay(day, now)
              const dayStart = localDayStartMs(day)
              const nowY = isToday ? minutesToY(((nowMs - dayStart) / 60000) % MINUTES_PER_DAY, pxPerHour) : null

              return (
                <div
                  key={dayKey(day)}
                  className="relative border-l border-[#dadce0] bg-white dark:border-slate-600 dark:bg-slate-900"
                  style={{ height: totalH }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-cal-block]')) return
                    const y = e.nativeEvent.offsetY
                    const clamped = Math.max(0, Math.min(totalH - 1, y))
                    const mins = (clamped / pxPerHour) * 60
                    const step = 15
                    const snapped = Math.round(mins / step) * step
                    onPickDay(day, Math.min(MINUTES_PER_DAY - step, snapped))
                  }}
                  role="presentation"
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute left-0 right-0 border-t border-[#e8eaed] dark:border-slate-700"
                      style={{ top: h * pxPerHour }}
                    />
                  ))}
                  {isToday && nowY != null && nowY >= 0 && nowY <= totalH && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-[5] border-t-2 border-red-500 opacity-90"
                      style={{ top: nowY }}
                      aria-hidden
                    />
                  )}
                  {laid.map((seg) => {
                    const top = minutesToY(seg.startMin, pxPerHour)
                    const hgt = durationToHeight(seg.startMin, seg.endMin, pxPerHour)
                    const wPct = 100 / seg.laneCount
                    const leftPct = (100 * seg.lane) / seg.laneCount
                    return (
                      <div
                        key={seg.id}
                        data-cal-block
                        className="absolute z-[4] overflow-hidden rounded border border-black/10 px-0.5 pt-0.5 text-left shadow-sm dark:border-white/10"
                        style={{
                          top,
                          height: hgt,
                          left: `calc(${leftPct}% + 1px)`,
                          width: `calc(${wPct}% - 2px)`,
                          backgroundColor: seg.color,
                          color: '#fff',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-0.5">
                          <div className="min-w-0 flex-1">
                            {seg.kind === 'task' && <ListTodo className="mb-0.5 inline h-3 w-3 opacity-90" aria-hidden />}
                            <p className="truncate text-[10px] font-semibold leading-tight">{seg.title}</p>
                            <p className="truncate text-[9px] opacity-90">
                              {(() => {
                                const h = Math.floor(seg.startMin / 60)
                                const m = Math.floor(seg.startMin % 60)
                                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                              })()}
                            </p>
                          </div>
                          {seg.kind === 'event' && seg.eventId != null && (
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 hover:bg-white/20"
                              aria-label="Supprimer"
                              onClick={() => onDeleteEvent(seg.eventId!)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                          {seg.kind === 'task' && seg.taskId != null && (
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-[9px] font-medium underline decoration-white/70 hover:bg-white/15"
                              onClick={() => navigate('/app/tasks')}
                            >
                              Tâches
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
