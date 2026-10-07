import { useEffect, useMemo, useRef, useState } from 'react'
import { localDate } from '../dates/localCalendar'
import type { ActivityByDay, ActivitySummary } from '../solves/activity'
import { activityLevel, activityThresholds, buildActivityCalendar, type ActivityRange } from './activityCalendar'

export function DailyActivityChart({ activity, firstYear, today, summary }: {
  activity: ActivityByDay
  firstYear: number
  today: string
  summary: ActivitySummary
}) {
  const [range, setRange] = useState<ActivityRange>({ kind: 'rolling' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentYear = localDate(today).getFullYear()
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, index) => currentYear - index)
  const { weeks, cells, months, totalAttempts } = useMemo(
    () => buildActivityCalendar(activity, range, today),
    [activity, range, today],
  )
  const thresholds = activityThresholds(cells.filter((cell) => cell.inRange).map((cell) => cell.count))
  const columns = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }
  const rangeValue = range.kind === 'rolling' ? 'current' : String(range.year)
  const period = range.kind === 'rolling' ? 'the last 12 months' : range.year

  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll && scroll.scrollWidth > scroll.clientWidth) scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth
  }, [weeks])

  return (
    <section className="account-calendar" aria-labelledby="account-calendar-title">
      <h2 id="account-calendar-title" className="account-visually-hidden">Activity</h2>
      <div className="account-calendar-inner">
        <div className="account-calendar-top">
          <select aria-label="Activity range" value={rangeValue} onChange={(event) => {
            const value = event.target.value
            if (value === 'current') setRange({ kind: 'rolling' })
            else if (years.includes(Number(value))) setRange({ kind: 'year', year: Number(value) })
          }}>
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
          <div className="account-calendar-layout" role="img" aria-label={`${totalAttempts} solves in ${period}. ${summary.totalActiveDays} lifetime active days, ${summary.currentStreak} day current streak, and ${summary.longestStreak} day longest streak.`}>
            <div className="account-calendar-days" aria-hidden="true"><span>mon</span><span>wed</span><span>fri</span></div>
            <div className="account-calendar-grid" style={columns} aria-hidden="true">
              {cells.map((cell) => {
                const level = activityLevel(cell.count, thresholds)
                return <i
                  key={cell.key}
                  className={`account-activity-level-${level}${cell.inRange ? '' : ' is-outside'}`}
                  title={`${cell.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}: ${cell.count} ${cell.count === 1 ? 'solve' : 'solves'}`}
                />
              })}
            </div>
            <div className="account-calendar-months" style={columns} aria-hidden="true">
              {months.map((month) => <span key={month.key}>{month.label}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
