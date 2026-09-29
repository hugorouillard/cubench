import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, getAccountActivity } from '../api'
import type { ActivityDay, Solve, UserProfile } from '../types'

type Day = { date: Date; key: string; count: number; inRange: boolean }

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function calendarWeeks(activity: ActivityDay[], range: string, now: Date): Day[][] {
  const today = new Date(now)
  today.setUTCHours(12, 0, 0, 0)
  const start = range === 'current' ? new Date(today) : new Date(Date.UTC(Number(range), 0, 1, 12))
  const end = range === 'current' ? new Date(today) : new Date(Date.UTC(Number(range), 11, 31, 12))
  if (range === 'current') {
    start.setUTCDate(start.getUTCDate() - 365)
  }
  if (end > today) end.setTime(today.getTime())

  const calendarStart = new Date(start)
  calendarStart.setUTCDate(calendarStart.getUTCDate() - calendarStart.getUTCDay())
  const calendarEnd = new Date(end)
  calendarEnd.setUTCDate(calendarEnd.getUTCDate() + 6 - calendarEnd.getUTCDay())

  const counts = new Map(activity.filter(({ day }) =>
    day >= utcDateKey(start) && day <= utcDateKey(end),
  ).map(({ day, attempts }) => [day, attempts]))

  const days: Day[] = []
  for (const cursor = new Date(calendarStart); cursor <= calendarEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = new Date(cursor)
    const key = utcDateKey(date)
    days.push({ date, key, count: counts.get(key) ?? 0, inRange: date >= start && date <= end })
  }
  const weeks: Day[][] = []
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7))
  return weeks
}

export function ActivityCalendar({ profile, solves, activity, revision, onError, onStale, activeDays, currentStreak, longestStreak }: {
  profile: UserProfile
  solves?: Solve[]
  activity?: ActivityDay[]
  revision?: number
  onError?: (error: string) => void
  onStale?: () => void
  activeDays: number
  currentStreak: number
  longestStreak: number
}) {
  const [range, setRange] = useState('current')
  const [yearActivity, setYearActivity] = useState<{
    year: string; revision: number; days: ActivityDay[]
  } | null>(null)
  const [yearError, setYearError] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = new Date()
  const todayKey = utcDateKey(now)
  const currentYear = now.getUTCFullYear()
  const joinedYear = Math.min(new Date(profile.created_at).getUTCFullYear(), currentYear)
  const years = Array.from({ length: currentYear - joinedYear + 1 }, (_, index) => currentYear - index)
  const previewActivity = useMemo(() => {
    const counts = new Map<string, number>()
    for (const solve of solves ?? []) {
      const day = utcDateKey(new Date(solve.recorded_at))
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
    return [...counts].map(([day, attempts]) => ({ day, attempts }))
  }, [solves])
  useEffect(() => {
    if (range === 'current' || revision === undefined) return
    let cancelled = false
    setYearActivity(null)
    setYearError(false)
    void getAccountActivity(Number(range), revision).then((days) => {
      if (!cancelled) setYearActivity({ year: range, revision, days })
    }).catch((error: unknown) => {
      if (cancelled) return
      setYearError(true)
      if (error instanceof ApiError && error.status === 409) onStale?.()
      else onError?.(error instanceof Error ? error.message : 'Could not load activity')
    })
    return () => { cancelled = true }
  }, [range, revision, onError, onStale])
  const yearReady = solves || range === 'current' ||
    (yearActivity?.year === range && yearActivity.revision === revision)
  const weeks = useMemo(() => calendarWeeks(
    solves ? previewActivity : range === 'current' ? activity ?? [] : yearActivity?.days ?? [],
    range, new Date(`${todayKey}T12:00:00Z`),
  ), [solves, previewActivity, activity, yearActivity, range, todayKey])
  const cells = weeks.flat()
  const totalAttempts = cells.reduce((total, cell) => total + cell.count, 0)
  const activeCounts = cells.filter((cell) => cell.inRange).map((cell) => cell.count).sort((a, b) => a - b)
  const trim = Math.round(activeCounts.length * 0.1)
  const middle = trim ? activeCounts.slice(trim, -trim) : activeCounts
  const mean = middle.length ? middle.reduce((total, count) => total + count, 0) / middle.length : 0
  const thresholds = [Math.floor(mean / 2), Math.round(mean), Math.round(mean * 1.5)]
  const columns = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }
  const period = range === 'current' ? 'the last 12 months' : range

  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll && scroll.scrollWidth > scroll.clientWidth) scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth
  }, [weeks])

  const rangeSelect = (
    <select aria-label="Activity range" value={range} onChange={(event) => setRange(event.target.value)}>
      <option value="current">last 12 months (UTC)</option>
      {years.map((year) => <option key={year} value={year}>{year}</option>)}
    </select>
  )

  if (!yearReady) return (
    <section className="account-calendar" aria-labelledby="account-calendar-title">
      <h2 id="account-calendar-title" className="account-visually-hidden">Activity</h2>
      {rangeSelect}
      <p role="status">{yearError ? 'Activity unavailable. Select a different range.' : 'loading activity...'}</p>
    </section>
  )

  return (
    <section className="account-calendar" aria-labelledby="account-calendar-title">
      <h2 id="account-calendar-title" className="account-visually-hidden">Activity</h2>
      <div className="account-calendar-inner">
        <div className="account-calendar-top">
          {rangeSelect}
          <span>{totalAttempts} {totalAttempts === 1 ? 'solve' : 'solves'}</span>
          <div className="account-calendar-legend" aria-hidden="true">
            <span>less</span>
            {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`account-activity-level-${level}`} />)}
            <span>more</span>
          </div>
        </div>
        <div className="account-calendar-scroll" ref={scrollRef}>
          <div className="account-calendar-layout" role="img" aria-label={`${totalAttempts} solves in ${period}. ${activeDays} lifetime active days, ${currentStreak} day current streak, and ${longestStreak} day longest streak.`}>
            <div className="account-calendar-days" aria-hidden="true"><span>mon</span><span>wed</span><span>fri</span></div>
            <div className="account-calendar-grid" style={columns} aria-hidden="true">
              {cells.map((cell) => {
                const threshold = thresholds.findIndex((value) => cell.count <= value)
                const level = cell.count === 0 ? 0 : threshold === -1 ? 4 : threshold + 1
                return <i
                  key={cell.key}
                  className={`account-activity-level-${level}${cell.inRange ? '' : ' is-outside'}`}
                  title={`${cell.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} UTC: ${cell.count} ${cell.count === 1 ? 'solve' : 'solves'}`}
                />
              })}
            </div>
            <div className="account-calendar-months" style={columns} aria-hidden="true">
              {weeks.map((week, index) => {
                const first = week.find((day) => day.inRange && day.date.getUTCDate() === 1)
                const month = first ?? (index === 0 ? week.find((day) => day.inRange) : undefined)
                return <span key={week[0].key}>{month?.date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) ?? ''}</span>
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
