import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react'
import {
  ArrowDownUp,
  CalendarDays,
  Download,
  Edit3,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ActiveElement,
  type ChartData,
  type ChartEvent,
  type ChartOptions,
} from 'chart.js'
import { Bar, Chart, Line } from 'react-chartjs-2'
import { getProfile, getSolves, updateProfile } from './api'
import {
  completedDuration,
  dailyAnalytics,
  filterSolves,
  lifetimeProfileSummary,
  personalBestHistory,
  solveDurationHistogram,
  solveHistory,
  summarizeSolves,
  type DatedSolveRecord,
  type SolveDateRange,
} from './stats'
import { formatTime } from './timer'
import type { Penalty, PracticeSession, Solve, UserProfile, UserProfileInput } from './types'
import './ProfileView.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
  Tooltip,
)

export type ProfileViewProps = {
  sessions: PracticeSession[]
  onPenalty: (solve: Solve, penalty: Penalty) => Promise<Solve | null>
  onDelete: (solve: Solve) => Promise<boolean>
  onExport: () => void
  onError: (message: string) => void
  onProfileChange: (profile: UserProfile) => void
}

type HistorySeries = {
  single: boolean
  pb: boolean
  ao5: boolean
  ao12: boolean
}

type SortKey = 'result' | 'penalty' | 'session' | 'timestamp'
type SortDirection = 'ascending' | 'descending'

type ActivityCell = {
  key: string
  date: Date
  count: number
  inRange: boolean
}

type ChartColors = {
  background: string
  main: string
  muted: string
  surface: string
  text: string
  error: string
  line: string
}

const RANGE_OPTIONS: { value: SolveDateRange; label: string; summary: string }[] = [
  { value: 'day', label: 'last day', summary: 'last 24 hours' },
  { value: 'week', label: 'last week', summary: 'last 7 days' },
  { value: 'month', label: 'last month', summary: 'last 30 days' },
  { value: 'threeMonths', label: 'last 3 months', summary: 'last 90 days' },
  { value: 'all', label: 'all time', summary: 'all time' },
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function initials(name: string): string {
  const value = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return value || 'CB'
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatLongDate(value: string): string {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatClock(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function statTime(durationMs: number | null): string {
  return durationMs === null ? '--' : formatTime(durationMs)
}

function profileInput(profile: UserProfile): UserProfileInput {
  return { display_name: profile.display_name, bio: profile.bio }
}

function getChartColors(): ChartColors {
  const readColor = (variable: string, fallback: string) => {
    if (typeof document === 'undefined') return fallback
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback
  }

  return {
    background: readColor('--bg-color', '#1e1e2e'),
    main: readColor('--main-color', '#cba6f7'),
    muted: readColor('--sub-readable-color', '#a6adc8'),
    surface: readColor('--sub-alt-color', '#181825'),
    text: readColor('--text-color', '#cdd6f4'),
    error: readColor('--error-readable-color', '#f38ba8'),
    line: readColor('--line-color', '#313244'),
  }
}

function activityWeeks(solves: Solve[]): ActivityCell[][] {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const rangeStart = new Date(today)
  rangeStart.setFullYear(rangeStart.getFullYear() - 1)
  rangeStart.setDate(rangeStart.getDate() + 1)

  const calendarStart = new Date(rangeStart)
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay())
  const calendarEnd = new Date(today)
  calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()))

  const attemptsByDay = new Map<string, number>()
  for (const solve of solves) {
    const date = new Date(solve.recorded_at)
    const solveDay = new Date(date)
    solveDay.setHours(12, 0, 0, 0)
    if (solveDay < rangeStart || solveDay > today) continue
    const key = localDateKey(date)
    attemptsByDay.set(key, (attemptsByDay.get(key) ?? 0) + 1)
  }

  const cells: ActivityCell[] = []
  for (const cursor = new Date(calendarStart); cursor <= calendarEnd; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor)
    const key = localDateKey(date)
    cells.push({
      key,
      date,
      count: attemptsByDay.get(key) ?? 0,
      inRange: date >= rangeStart && date <= today,
    })
  }

  const weeks: ActivityCell[][] = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))
  return weeks
}

function recordContent(record: DatedSolveRecord | null) {
  if (!record) {
    return (
      <>
        <strong>--</strong>
        <span>not set</span>
      </>
    )
  }

  return (
    <>
      <strong>{formatTime(record.durationMs)}</strong>
      <time dateTime={record.achievedAt}>{formatLongDate(record.achievedAt)}</time>
    </>
  )
}

type ProfileEditorProps = {
  open: boolean
  profile: UserProfile
  onClose: () => void
  onSaved: (profile: UserProfile) => void
  onError: (message: string) => void
}

function ProfileEditor({ open, profile, onClose, onSaved, onError }: ProfileEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<UserProfileInput>(() => profileInput(profile))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      setDraft(profileInput(profile))
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, profile])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = {
      display_name: draft.display_name.trim(),
      bio: draft.bio.trim(),
    }
    if (!input.display_name) return

    setSaving(true)
    try {
      const updatedProfile = await updateProfile(input)
      onSaved(updatedProfile)
      onClose()
    } catch (error) {
      onError(`Could not update profile: ${errorMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      id="profile-editor-dialog"
      className="profile-dialog"
      ref={dialogRef}
      aria-labelledby="profile-editor-title"
      onClose={onClose}
      onCancel={(event) => {
        if (saving) event.preventDefault()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form className="profile-editor" onSubmit={(event) => void submit(event)}>
        <header>
          <div>
            <span className="profile-kicker">profile details</span>
            <h2 id="profile-editor-title">Edit profile</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close profile editor">
            <X aria-hidden="true" />
          </button>
        </header>

        <label>
          <span>display name</span>
          <input
            autoFocus
            required
            maxLength={40}
            autoComplete="name"
            value={draft.display_name}
            onChange={(event) => setDraft({ ...draft, display_name: event.target.value })}
          />
        </label>
        <label>
          <span>bio</span>
          <textarea
            maxLength={160}
            rows={4}
            value={draft.bio}
            onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
          />
          <small>{draft.bio.length}/160</small>
        </label>

        <div className="profile-editor-actions">
          <button type="button" onClick={onClose} disabled={saving}>cancel</button>
          <button className="is-primary" type="submit" disabled={saving}>
            {saving ? 'saving...' : 'save profile'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

type ActivityHeatmapProps = {
  weeks: ActivityCell[][]
  activeDays: number
  currentStreak: number
  longestStreak: number
}

function ActivityHeatmap({
  weeks,
  activeDays,
  currentStreak,
  longestStreak,
}: ActivityHeatmapProps) {
  const maxAttempts = Math.max(0, ...weeks.flat().map((cell) => cell.count))

  return (
    <section className="profile-activity" aria-labelledby="profile-activity-title">
      <div className="profile-section-heading">
        <div>
          <span className="profile-kicker">last 12 months</span>
          <h2 id="profile-activity-title">Activity</h2>
        </div>
        <div className="profile-activity-totals" aria-label="Activity streak statistics">
          <span><strong>{activeDays}</strong>active days</span>
          <span><strong>{currentStreak}</strong>current streak</span>
          <span><strong>{longestStreak}</strong>longest streak</span>
        </div>
      </div>

      <div className="profile-heatmap-scroll">
        <div className="profile-heatmap-key" aria-hidden="true">
          <span>less</span>
          <i className="level-0" />
          <i className="level-1" />
          <i className="level-2" />
          <i className="level-3" />
          <i className="level-4" />
          <span>more</span>
        </div>
        <div
          className="profile-heatmap-layout"
          role="img"
          aria-label={`${activeDays} active days in total, ${currentStreak} day current streak, and ${longestStreak} day longest streak. Heatmap includes every solve attempt in the last 12 months.`}
        >
          <div className="profile-heatmap-days" aria-hidden="true">
            <span>mon</span>
            <span>wed</span>
            <span>fri</span>
          </div>
          <div className="profile-heatmap" aria-hidden="true">
            {weeks.map((week, weekIndex) => (
              <div className="profile-heatmap-week" key={week[0]?.key ?? weekIndex}>
                {week.map((cell) => {
                  const level = cell.count === 0 || maxAttempts === 0
                    ? 0
                    : Math.max(1, Math.ceil((cell.count / maxAttempts) * 4))
                  const attemptLabel = `${cell.count} ${cell.count === 1 ? 'attempt' : 'attempts'}`
                  return (
                    <i
                      className={`profile-heatmap-cell level-${level}${cell.inRange ? '' : ' is-outside'}`}
                      key={cell.key}
                      title={`${formatLongDate(cell.date.toISOString())}: ${attemptLabel}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function EmptyChart({ children }: { children: string }) {
  return <p className="profile-chart-empty">{children}</p>
}

export function ProfileView({
  sessions,
  onPenalty,
  onDelete,
  onExport,
  onError,
  onProfileChange,
}: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [solves, setSolves] = useState<Solve[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [range, setRange] = useState<SolveDateRange>('all')
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[] | null>(null)
  const [historySeries, setHistorySeries] = useState<HistorySeries>({
    single: true,
    pb: true,
    ao5: true,
    ao12: true,
  })
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending')
  const [visibleCount, setVisibleCount] = useState(25)
  const [selectedSolveId, setSelectedSolveId] = useState<string | null>(null)
  const [pendingSolveIds, setPendingSolveIds] = useState<string[]>([])
  const [filtersPending, startFilterTransition] = useTransition()
  const reportLoadError = useEffectEvent(onError)

  useEffect(() => {
    let cancelled = false

    void Promise.allSettled([getProfile(), getSolves()]).then(([profileResult, solvesResult]) => {
      if (cancelled) return

      let failed = false
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
      else {
        failed = true
        reportLoadError(`Could not load profile: ${errorMessage(profileResult.reason)}`)
      }

      if (solvesResult.status === 'fulfilled') setSolves(solvesResult.value)
      else {
        failed = true
        reportLoadError(`Could not load solve history: ${errorMessage(solvesResult.reason)}`)
      }

      setLoadFailed(failed)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const lifetime = useMemo(() => lifetimeProfileSummary(solves), [solves])
  const weeks = useMemo(() => activityWeeks(solves), [solves])
  const lifetimePbSolveIds = useMemo(
    () => new Set(personalBestHistory(solves).map((record) => record.solve.id)),
    [solves],
  )
  const filteredSolves = useMemo(
    () => filterSolves(solves, range, selectedSessionIds),
    [range, selectedSessionIds, solves],
  )
  const analytics = useMemo(() => {
    const history = solveHistory(filteredSolves)

    return {
      summary: summarizeSolves(filteredSolves),
      history,
      daily: dailyAnalytics(filteredSolves),
      histogram: solveDurationHistogram(filteredSolves),
      solveById: new Map(filteredSolves.map((solve) => [solve.id, solve])),
    }
  }, [filteredSolves])

  const sortedSolves = useMemo(() => {
    const sessionNames = new Map(sessions.map((session) => [session.id, session.name]))
    const penaltyOrder: Record<Penalty, number> = { none: 0, plus2: 1, dnf: 2 }
    const direction = sortDirection === 'ascending' ? 1 : -1

    return [...filteredSolves].sort((left, right) => {
      let comparison = 0
      if (sortKey === 'result') {
        comparison = (completedDuration(left) ?? Number.POSITIVE_INFINITY) -
          (completedDuration(right) ?? Number.POSITIVE_INFINITY)
      } else if (sortKey === 'penalty') {
        comparison = penaltyOrder[left.penalty] - penaltyOrder[right.penalty]
      } else if (sortKey === 'session') {
        comparison = (sessionNames.get(left.session_id) ?? '').localeCompare(
          sessionNames.get(right.session_id) ?? '',
        )
      } else {
        comparison = new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime()
      }

      if (comparison === 0) comparison = left.id.localeCompare(right.id)
      return comparison * direction
    })
  }, [filteredSolves, sessions, sortDirection, sortKey])

  const colors = getChartColors()
  const historyChartData = useMemo<ChartData<'line', (number | null)[], string>>(() => ({
    labels: analytics.history.map((point) => new Date(point.recordedAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })),
    datasets: [
      {
        label: 'single',
        data: analytics.history.map((point) => point.singleMs),
        borderColor: colors.main,
        backgroundColor: colors.main,
        pointRadius: 2.5,
        pointHoverRadius: 6,
        showLine: false,
        hidden: !historySeries.single,
      },
      {
        label: 'DNF',
        data: analytics.history.map((point) => {
          if (point.singleMs !== null) return null
          return analytics.solveById.get(point.solveId)?.duration_ms ?? null
        }),
        borderColor: colors.error,
        backgroundColor: colors.error,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointStyle: 'crossRot',
        showLine: false,
        hidden: !historySeries.single,
      },
      {
        label: 'PB',
        data: analytics.history.map((point) => point.pbSingleMs),
        borderColor: colors.main,
        backgroundColor: colors.main,
        borderWidth: 1.5,
        borderDash: [3, 5],
        pointRadius: 0,
        pointHoverRadius: 4,
        stepped: true,
        spanGaps: true,
        hidden: !historySeries.pb,
      },
      {
        label: 'ao5',
        data: analytics.history.map((point) => point.ao5Ms),
        borderColor: colors.text,
        backgroundColor: colors.text,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: false,
        hidden: !historySeries.ao5,
      },
      {
        label: 'ao12',
        data: analytics.history.map((point) => point.ao12Ms),
        borderColor: colors.muted,
        backgroundColor: colors.muted,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: false,
        hidden: !historySeries.ao12,
      },
    ],
  }), [
    analytics.history,
    analytics.solveById,
    colors.error,
    colors.main,
    colors.muted,
    colors.text,
    historySeries,
  ])

  const histogramChartData = useMemo<ChartData<'bar', number[], string>>(() => ({
    labels: analytics.histogram.map((bucket) => bucket.label),
    datasets: [{
      label: 'solves',
      data: analytics.histogram.map((bucket) => bucket.count),
      backgroundColor: colors.main,
      borderWidth: 0,
      borderRadius: 2,
    }],
  }), [analytics.histogram, colors.main])

  const dailyChartData = useMemo<ChartData<'bar' | 'line', (number | null)[], string>>(() => ({
    labels: analytics.daily.map((day) => day.label),
    datasets: [
      {
        type: 'bar',
        label: 'attempts',
        data: analytics.daily.map((day) => day.attemptCount),
        backgroundColor: colors.main,
        borderWidth: 0,
        borderRadius: 2,
        yAxisID: 'yAttempts',
      },
      {
        type: 'line',
        label: 'mean',
        data: analytics.daily.map((day) => day.nonDnfMeanMs),
        borderColor: colors.text,
        backgroundColor: colors.text,
        borderWidth: 1.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        spanGaps: false,
        yAxisID: 'yTime',
      },
    ],
  }), [analytics.daily, colors.main, colors.text])

  function updateRange(nextRange: SolveDateRange) {
    startFilterTransition(() => {
      setRange(nextRange)
      setVisibleCount(25)
      setSelectedSolveId(null)
    })
  }

  function updateAllSessions(checked: boolean) {
    startFilterTransition(() => {
      setSelectedSessionIds(checked ? null : [])
      setVisibleCount(25)
      setSelectedSolveId(null)
    })
  }

  function updateSession(sessionId: string, checked: boolean) {
    startFilterTransition(() => {
      setSelectedSessionIds((current) => {
        if (current === null) {
          if (checked) return null
          return sessions.map((session) => session.id).filter((id) => id !== sessionId)
        }

        const next = checked
          ? [...new Set([...current, sessionId])]
          : current.filter((id) => id !== sessionId)
        return next.length === sessions.length ? null : next
      })
      setVisibleCount(25)
      setSelectedSolveId(null)
    })
  }

  function selectSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => current === 'ascending' ? 'descending' : 'ascending')
    } else {
      setSortKey(nextSortKey)
      setSortDirection(nextSortKey === 'timestamp' ? 'descending' : 'ascending')
    }
    setVisibleCount(25)
    setSelectedSolveId(null)
  }

  function revealSolve(solveId: string) {
    const index = sortedSolves.findIndex((solve) => solve.id === solveId)
    if (index < 0) return

    setVisibleCount((current) => Math.max(current, Math.ceil((index + 1) / 25) * 25))
    setSelectedSolveId(solveId)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const row = document.getElementById(`profile-solve-${solveId}`)
        row?.focus({ preventScroll: true })
        row?.scrollIntoView({ block: 'center' })
      })
    })
  }

  async function changePenalty(solve: Solve, penalty: Penalty) {
    setPendingSolveIds((current) => [...current, solve.id])
    try {
      const updatedSolve = await onPenalty(solve, penalty)
      if (updatedSolve) {
        setSolves((current) => current.map((item) => item.id === solve.id ? updatedSolve : item))
      }
    } catch (error) {
      onError(`Could not update solve: ${errorMessage(error)}`)
    } finally {
      setPendingSolveIds((current) => current.filter((id) => id !== solve.id))
    }
  }

  async function removeSolve(solve: Solve) {
    setPendingSolveIds((current) => [...current, solve.id])
    try {
      if (await onDelete(solve)) {
        setSolves((current) => current.filter((item) => item.id !== solve.id))
        if (selectedSolveId === solve.id) setSelectedSolveId(null)
      }
    } catch (error) {
      onError(`Could not delete solve: ${errorMessage(error)}`)
    } finally {
      setPendingSolveIds((current) => current.filter((id) => id !== solve.id))
    }
  }

  function sortAria(key: SortKey): SortDirection | 'none' {
    return sortKey === key ? sortDirection : 'none'
  }

  if (loading) {
    return (
      <main className="profile-view profile-load-state page-width" aria-busy="true">
        <div role="status" aria-live="polite">
          <span className="profile-kicker">profile</span>
          <p>loading account history...</p>
        </div>
      </main>
    )
  }

  if (loadFailed || !profile) {
    return (
      <main className="profile-view profile-load-state page-width">
        <div role="status" aria-live="polite">
          <span className="profile-kicker">profile unavailable</span>
          <p>CubeBench could not load the complete profile. Try opening this page again.</p>
        </div>
      </main>
    )
  }

  const successPercentage = lifetime.loggedCount === 0
    ? 0
    : Math.round((lifetime.successfulCount / lifetime.loggedCount) * 100)
  const filteredSuccessful = analytics.summary.count - analytics.summary.dnfCount
  const filteredSuccessPercentage = analytics.summary.count === 0
    ? 0
    : Math.round((filteredSuccessful / analytics.summary.count) * 100)
  const plus2Count = filteredSolves.filter((solve) => solve.penalty === 'plus2').length
  const activeRange = RANGE_OPTIONS.find((option) => option.value === range)?.summary ?? 'all time'
  const sessionSummary = selectedSessionIds === null
    ? 'all sessions'
    : selectedSessionIds.length === 0
      ? 'no sessions'
      : selectedSessionIds.length === 1
        ? sessions.find((session) => session.id === selectedSessionIds[0])?.name ?? '1 session'
        : `${selectedSessionIds.length} sessions`
  const visibleSolves = sortedSolves.slice(0, visibleCount)
  const historyOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    normalized: true,
    interaction: { mode: 'nearest', intersect: true },
    onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
      const element = elements[0]
      if (!element || (element.datasetIndex !== 0 && element.datasetIndex !== 1)) return
      const point = analytics.history[element.index]
      if (point) revealSolve(point.solveId)
    },
    plugins: {
      tooltip: {
        displayColors: false,
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.muted,
        borderColor: colors.line,
        borderWidth: 1,
        callbacks: {
          title: (items) => {
            const point = analytics.history[items[0]?.dataIndex]
            return point ? formatDateTime(point.recordedAt) : ''
          },
          label: (context) => {
            const point = analytics.history[context.dataIndex]
            const solve = point ? analytics.solveById.get(point.solveId) : undefined
            if (!point || !solve) return ''
            if (context.dataset.label === 'DNF') {
              return [`DNF · raw ${formatTime(solve.duration_ms)}`, 'penalty: DNF']
            }

            const value = context.parsed.y
            if (value === null) return ''
            const penalty = solve.penalty === 'plus2'
              ? `penalty: +2 · raw ${formatTime(solve.duration_ms)}`
              : solve.penalty === 'dnf'
                ? 'penalty: DNF'
                : 'penalty: none'
            return [`${context.dataset.label}: ${formatTime(value)}`, penalty]
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: colors.line },
        ticks: { color: colors.muted, maxTicksLimit: 8, maxRotation: 0 },
      },
      y: {
        reverse: true,
        grid: { color: colors.line },
        border: { display: false },
        ticks: {
          color: colors.muted,
          callback: (value) => formatTime(Number(value)),
        },
      },
    },
  }
  const histogramOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      tooltip: {
        displayColors: false,
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.muted,
        borderColor: colors.line,
        borderWidth: 1,
        callbacks: {
          label: (context) => `${context.parsed.y} ${context.parsed.y === 1 ? 'solve' : 'solves'}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: colors.line },
        ticks: { color: colors.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
      },
      y: {
        beginAtZero: true,
        grid: { color: colors.line },
        border: { display: false },
        ticks: { color: colors.muted, precision: 0 },
      },
    },
  }
  const dailyOptions: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      tooltip: {
        displayColors: false,
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.muted,
        borderColor: colors.line,
        borderWidth: 1,
        callbacks: {
          label: () => [],
          afterBody: (items) => {
            const day = analytics.daily[items[0]?.dataIndex]
            if (!day) return []
            return [
              `attempts: ${day.attemptCount}`,
              `DNF: ${day.dnfCount}`,
              `mean: ${statTime(day.nonDnfMeanMs)}`,
              `best: ${statTime(day.nonDnfBestMs)}`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: colors.line },
        ticks: { color: colors.muted, maxRotation: 0, maxTicksLimit: 7 },
      },
      yAttempts: {
        beginAtZero: true,
        position: 'left',
        grid: { color: colors.line },
        border: { display: false },
        ticks: { color: colors.muted, precision: 0 },
      },
      yTime: {
        reverse: true,
        position: 'right',
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: colors.muted,
          callback: (value) => formatTime(Number(value)),
        },
      },
    },
  }

  return (
    <main className="profile-view page-width" aria-busy={filtersPending}>
      <section className="profile-identity-band" aria-labelledby="profile-name">
        <div className="profile-avatar" aria-hidden="true">{initials(profile.display_name)}</div>
        <div className="profile-identity-copy">
          <span className="profile-kicker">solver profile</span>
          <h1 id="profile-name">{profile.display_name}</h1>
          {profile.bio && <p>{profile.bio}</p>}
          <span className="profile-tracking">
            <CalendarDays aria-hidden="true" />
            {lifetime.earliestSolveAt
              ? `tracking since ${formatLongDate(lifetime.earliestSolveAt)}`
              : 'tracking starts with your first solve'}
          </span>
        </div>
        <button
          className="profile-edit-button"
          type="button"
          onClick={() => setEditorOpen(true)}
          aria-haspopup="dialog"
          aria-controls="profile-editor-dialog"
        >
          <Edit3 aria-hidden="true" />
          edit profile
        </button>
      </section>

      <section className="profile-lifetime-metrics" aria-label="Lifetime totals">
        <div>
          <span>solves logged</span>
          <strong>{lifetime.loggedCount.toLocaleString()}</strong>
        </div>
        <div>
          <span>successful</span>
          <strong>{lifetime.successfulCount.toLocaleString()}</strong>
          <small>{successPercentage}% of attempts</small>
        </div>
        <div>
          <span>timed solving</span>
          <strong>{formatClock(lifetime.totalRawDurationMs)}</strong>
        </div>
      </section>

      <section className="profile-pb-band" aria-labelledby="profile-pb-title">
        <div className="profile-pb-title">
          <Trophy aria-hidden="true" />
          <div>
            <span className="profile-kicker">lifetime</span>
            <h2 id="profile-pb-title">Personal bests</h2>
          </div>
        </div>
        <div><span>single</span>{recordContent(lifetime.bestSingle)}</div>
        <div><span>ao5</span>{recordContent(lifetime.bestAo5)}</div>
        <div><span>ao12</span>{recordContent(lifetime.bestAo12)}</div>
      </section>

      <ActivityHeatmap
        weeks={weeks}
        activeDays={lifetime.totalActiveDays}
        currentStreak={lifetime.currentStreak}
        longestStreak={lifetime.longestStreak}
      />

      <section className="profile-filter-boundary" aria-labelledby="profile-filter-title">
        <div className="profile-filter-heading">
          <div>
            <span className="profile-kicker">analysis range</span>
            <h2 id="profile-filter-title">Filter history</h2>
          </div>
          <button className="profile-export-button" type="button" onClick={onExport}>
            <Download aria-hidden="true" />
            export all data (.json)
          </button>
        </div>

        <fieldset className="profile-filter-group">
          <legend>date range</legend>
          <div className="profile-filter-options">
            {RANGE_OPTIONS.map((option) => (
              <button
                className={range === option.value ? 'is-active' : ''}
                type="button"
                key={option.value}
                onClick={() => updateRange(option.value)}
                aria-pressed={range === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="profile-filter-group profile-session-filter">
          <legend>sessions</legend>
          <div className="profile-filter-options">
            <label>
              <input
                type="checkbox"
                checked={selectedSessionIds === null}
                onChange={(event) => updateAllSessions(event.target.checked)}
              />
              <span>all</span>
            </label>
            {sessions.map((session, index) => (
              <label key={session.id}>
                <input
                  type="checkbox"
                  checked={selectedSessionIds === null || selectedSessionIds.includes(session.id)}
                  onChange={(event) => updateSession(session.id, event.target.checked)}
                  aria-describedby={`profile-session-name-${index}`}
                />
                <span id={`profile-session-name-${index}`}>{session.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className="profile-filter-summary" aria-live="polite">
          {activeRange} · {sessionSummary} · {filteredSolves.length.toLocaleString()} {filteredSolves.length === 1 ? 'solve' : 'solves'}
          {filtersPending && <span> · updating charts...</span>}
        </p>
      </section>

      <section className="profile-chart-section profile-history-section" aria-labelledby="profile-history-title">
        <div className="profile-section-heading">
          <div>
            <span className="profile-kicker">solve by solve</span>
            <h2 id="profile-history-title">History</h2>
          </div>
          <div className="profile-series-toggles" aria-label="History chart series">
            {(Object.keys(historySeries) as (keyof HistorySeries)[]).map((series) => (
              <button
                className={historySeries[series] ? 'is-active' : ''}
                type="button"
                key={series}
                onClick={() => setHistorySeries((current) => ({
                  ...current,
                  [series]: !current[series],
                }))}
                aria-pressed={historySeries[series]}
                aria-controls="profile-history-chart"
              >
                {series}
              </button>
            ))}
          </div>
        </div>
        {analytics.history.length === 0 ? (
          <EmptyChart>No solves match the current filters.</EmptyChart>
        ) : (
          <div className="profile-chart profile-history-chart">
            <Line
              id="profile-history-chart"
              data={historyChartData}
              options={historyOptions}
              role="img"
              aria-label="Chronological solve history with singles, DNF attempts, running personal best, ao5, and ao12. Select a single point to reveal its table row."
            />
          </div>
        )}
      </section>

      <div className="profile-chart-pair">
        <section className="profile-chart-section" aria-labelledby="profile-histogram-title">
          <div className="profile-section-heading">
            <div>
              <span className="profile-kicker">adjusted results</span>
              <h2 id="profile-histogram-title">Distribution</h2>
            </div>
          </div>
          {analytics.histogram.length === 0 ? (
            <EmptyChart>No successful solves to distribute.</EmptyChart>
          ) : (
            <div className="profile-chart profile-small-chart">
              <Bar
                data={histogramChartData}
                options={histogramOptions}
                role="img"
                aria-label="Histogram of adjusted successful solve durations"
              />
            </div>
          )}
        </section>

        <section className="profile-chart-section" aria-labelledby="profile-daily-title">
          <div className="profile-section-heading">
            <div>
              <span className="profile-kicker">day by day</span>
              <h2 id="profile-daily-title">Daily attempts and mean</h2>
            </div>
            <div className="profile-chart-legend" aria-hidden="true">
              <span><i className="is-attempts" />attempts</span>
              <span><i className="is-mean" />mean</span>
            </div>
          </div>
          {analytics.daily.length === 0 ? (
            <EmptyChart>No daily activity in this range.</EmptyChart>
          ) : (
            <div className="profile-chart profile-small-chart">
              <Chart
                type="bar"
                data={dailyChartData}
                options={dailyOptions}
                role="img"
                aria-label="Daily attempt counts and adjusted non-DNF mean times"
              />
            </div>
          )}
        </section>
      </div>

      <section className="profile-filtered-stats" aria-label="Filtered statistics">
        <div><span>logged</span><strong>{analytics.summary.count}</strong></div>
        <div><span>successful</span><strong>{filteredSuccessful}</strong><small>{filteredSuccessPercentage}%</small></div>
        <div><span>+2</span><strong>{plus2Count}</strong></div>
        <div><span>DNF</span><strong>{analytics.summary.dnfCount}</strong></div>
        <div><span>mean</span><strong>{statTime(analytics.summary.mean)}</strong></div>
        <div><span>best single</span><strong>{statTime(analytics.summary.bestSingle)}</strong></div>
        <div><span>current ao5</span><strong>{statTime(analytics.summary.currentAo5)}</strong></div>
        <div><span>best ao5</span><strong>{statTime(analytics.summary.bestAo5)}</strong></div>
        <div><span>current ao12</span><strong>{statTime(analytics.summary.currentAo12)}</strong></div>
        <div><span>best ao12</span><strong>{statTime(analytics.summary.bestAo12)}</strong></div>
      </section>

      <section className="profile-table-section" aria-labelledby="profile-solves-title">
        <div className="profile-section-heading">
          <div>
            <span className="profile-kicker">filtered log</span>
            <h2 id="profile-solves-title">Solves</h2>
          </div>
          <span className="profile-row-count">showing {Math.min(visibleCount, sortedSolves.length)} of {sortedSolves.length}</span>
        </div>

        {sortedSolves.length === 0 ? (
          <p className="profile-table-empty">No solves match the current filters.</p>
        ) : (
          <>
            <div className="profile-table-scroll">
              <table className="profile-solve-table">
                <caption>Filtered solve history. Column headings with arrows can be sorted.</caption>
                <thead>
                  <tr>
                    <th className="profile-pb-column" scope="col">PB</th>
                    <th scope="col" aria-sort={sortAria('result')}>
                      <button type="button" onClick={() => selectSort('result')}>
                        result <ArrowDownUp aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col" aria-sort={sortAria('penalty')}>
                      <button type="button" onClick={() => selectSort('penalty')}>
                        penalty <ArrowDownUp aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col" aria-sort={sortAria('session')}>
                      <button type="button" onClick={() => selectSort('session')}>
                        session <ArrowDownUp aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col" aria-sort={sortAria('timestamp')}>
                      <button type="button" onClick={() => selectSort('timestamp')}>
                        recorded <ArrowDownUp aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col">scramble</th>
                    <th scope="col"><span className="profile-sr-only">actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSolves.map((solve) => {
                    const pending = pendingSolveIds.includes(solve.id)
                    const isPb = lifetimePbSolveIds.has(solve.id)
                    return (
                      <tr
                        className={`${isPb ? 'is-pb ' : ''}${selectedSolveId === solve.id ? 'is-selected' : ''}`.trim()}
                        id={`profile-solve-${solve.id}`}
                        key={solve.id}
                        tabIndex={-1}
                        aria-current={selectedSolveId === solve.id ? 'true' : undefined}
                      >
                        <td className="profile-pb-column">
                          {isPb && <span title="Personal best at this point">pb</span>}
                        </td>
                        <td className="profile-result-cell">
                          <strong>{formatTime(solve.duration_ms, solve.penalty)}</strong>
                          {solve.penalty !== 'none' && <small>raw {formatTime(solve.duration_ms)}</small>}
                        </td>
                        <td>{solve.penalty === 'none' ? 'none' : solve.penalty === 'plus2' ? '+2' : 'DNF'}</td>
                        <td>{sessions.find((session) => session.id === solve.session_id)?.name ?? 'unknown session'}</td>
                        <td>
                          <time dateTime={solve.recorded_at}>{formatDateTime(solve.recorded_at)}</time>
                        </td>
                        <td className="profile-scramble-cell">
                          <details>
                            <summary>show</summary>
                            <span>{solve.scramble}</span>
                          </details>
                        </td>
                        <td>
                          <div className="profile-solve-actions">
                            <button
                              className={solve.penalty === 'plus2' ? 'is-active' : ''}
                              type="button"
                              disabled={pending}
                              onClick={() => void changePenalty(solve, 'plus2')}
                              aria-pressed={solve.penalty === 'plus2'}
                              aria-label={`Toggle +2 penalty for ${formatTime(solve.duration_ms)} solve`}
                            >
                              +2
                            </button>
                            <button
                              className={solve.penalty === 'dnf' ? 'is-active' : ''}
                              type="button"
                              disabled={pending}
                              onClick={() => void changePenalty(solve, 'dnf')}
                              aria-pressed={solve.penalty === 'dnf'}
                              aria-label={`Toggle DNF penalty for ${formatTime(solve.duration_ms)} solve`}
                            >
                              dnf
                            </button>
                            <button
                              className="is-delete"
                              type="button"
                              disabled={pending}
                              onClick={() => void removeSolve(solve)}
                              aria-label={`Delete ${formatTime(solve.duration_ms)} solve`}
                              title="Delete solve"
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {visibleCount < sortedSolves.length && (
              <button
                className="profile-load-more"
                type="button"
                onClick={() => setVisibleCount((current) => current + 25)}
              >
                load 25 more
              </button>
            )}
          </>
        )}
      </section>

      <ProfileEditor
        open={editorOpen}
        profile={profile}
        onClose={() => setEditorOpen(false)}
        onSaved={(updatedProfile) => {
          setProfile(updatedProfile)
          onProfileChange(updatedProfile)
        }}
        onError={onError}
      />
    </main>
  )
}
