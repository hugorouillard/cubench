import { useEffect, useMemo, useRef, useState } from 'react'
import type { Solve, UserProfile } from '../types'

type Day = { date: Date; key: string; count: number; inRange: boolean }

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calendarWeeks(solves: Solve[], range: string, now: Date): Day[][] {
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const start = range === 'current' ? new Date(today) : new Date(Number(range), 0, 1, 12)
  const end = range === 'current' ? new Date(today) : new Date(Number(range), 11, 31, 12)
  if (range === 'current') {
    start.setFullYear(start.getFullYear() - 1)
    start.setDate(start.getDate() + 1)
  }
  if (end > today) end.setTime(today.getTime())

  const calendarStart = new Date(start)
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay())
  const calendarEnd = new Date(end)
  calendarEnd.setDate(calendarEnd.getDate() + 6 - calendarEnd.getDay())

  const counts = new Map<string, number>()
  for (const solve of solves) {
    const date = new Date(solve.recorded_at)
    const day = new Date(date)
    day.setHours(12, 0, 0, 0)
    if (day < start || day > end) continue
    const key = localDateKey(date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const days: Day[] = []
  for (const cursor = new Date(calendarStart); cursor <= calendarEnd; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor)
    const key = localDateKey(date)
    days.push({ date, key, count: counts.get(key) ?? 0, inRange: date >= start && date <= end })
  }
  const weeks: Day[][] = []
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7))
  return weeks
}

export function ActivityCalendar({ profile, solves, activeDays, currentStreak, longestStreak }: {
  profile: UserProfile
  solves: Solve[]
  activeDays: number
  currentStreak: number
  longestStreak: number
}) {
  const [range, setRange] = useState('current')
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = new Date()
  const todayKey = localDateKey(now)
  const currentYear = now.getFullYear()
  const joinedYear = Math.min(new Date(profile.created_at).getFullYear(), currentYear)
  const years = Array.from({ length: currentYear - joinedYear + 1 }, (_, index) => currentYear - index)
  const weeks = useMemo(() => calendarWeeks(solves, range, new Date(`${todayKey}T12:00:00`)), [solves, range, todayKey])
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

  return (
    <section className="account-calendar" aria-labelledby="account-calendar-title">
      <h2 id="account-calendar-title" className="account-visually-hidden">Activity</h2>
      <div className="account-calendar-inner">
        <div className="account-calendar-top">
          <select aria-label="Activity range" value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="current">last 12 months</option>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
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
                  title={`${cell.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}: ${cell.count} ${cell.count === 1 ? 'solve' : 'solves'}`}
                />
              })}
            </div>
            <div className="account-calendar-months" style={columns} aria-hidden="true">
              {weeks.map((week, index) => {
                const first = week.find((day) => day.inRange && day.date.getDate() === 1)
                const month = first ?? (index === 0 ? week.find((day) => day.inRange) : undefined)
                return <span key={week[0].key}>{month?.date.toLocaleDateString('en-GB', { month: 'short' }) ?? ''}</span>
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
