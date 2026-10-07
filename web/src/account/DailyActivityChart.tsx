import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { localDate } from '../dates/localCalendar'
import type { ActivityByDay, ActivitySummary } from '../solves/activity'
import { activityLevel, activityThresholds, buildActivityCalendar, type ActivityRange } from './activityCalendar'
import { formatAccountDate } from './format'
import './DailyActivityChart.css'

function solveCount(count: number): string {
  return `${count} ${count === 1 ? 'solve' : 'solves'}`
}

export function DailyActivityChart({ activity, firstYear, today, summary }: {
  activity: ActivityByDay
  firstYear: number
  today: string
  summary: ActivitySummary
}) {
  const titleId = useId()
  const [range, setRange] = useState<ActivityRange>({ kind: 'rolling' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentYear = localDate(today).getFullYear()
  // Keep a selected historical year available if its last solve is deleted.
  const earliestYear = Math.min(firstYear, range.kind === 'year' ? range.year : currentYear)
  const years = Array.from({ length: currentYear - earliestYear + 1 }, (_, index) => currentYear - index)
  const { weeks, cells, months, totalAttempts } = useMemo(
    () => buildActivityCalendar(activity, range, today),
    [activity, range, today],
  )
  const days = cells.filter((cell) => cell.inRange)
  const thresholds = activityThresholds(days.map((cell) => cell.count))
  const layoutStyle = { '--calendar-weeks': weeks.length } as CSSProperties
  const columns = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }
  const rangeValue = range.kind === 'rolling' ? 'current' : String(range.year)
  const period = range.kind === 'rolling' ? 'the last 12 months' : range.year

  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll && scroll.scrollWidth > scroll.clientWidth) scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth
  }, [rangeValue])

  return (
    <section className="account-calendar" aria-labelledby={titleId}>
      <h2 id={titleId} className="sr-only">Activity</h2>
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
          <span>{solveCount(totalAttempts)}</span>
          <div className="account-calendar-legend" aria-hidden="true">
            <span>less</span>
            {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`account-activity-level-${level}`} />)}
            <span>more</span>
          </div>
        </div>
        <div className="account-calendar-scroll" ref={scrollRef}>
          <div className="account-calendar-layout" style={layoutStyle} role="img" aria-label={`${solveCount(totalAttempts)} in ${period}. ${summary.totalActiveDays} lifetime active days, ${summary.currentStreak} day current streak, and ${summary.longestStreak} day longest streak.`}>
            <div className="account-calendar-days" aria-hidden="true"><span>mon</span><span>wed</span><span>fri</span></div>
            <div className="account-calendar-grid" style={columns} aria-hidden="true">
              {cells.map((cell) => {
                const level = activityLevel(cell.count, thresholds)
                return <i
                  key={cell.key}
                  className={`account-activity-level-${level}${cell.inRange ? '' : ' is-outside'}`}
                  title={`${formatAccountDate(cell.date)}: ${solveCount(cell.count)}`}
                />
              })}
            </div>
            <div className="account-calendar-months" style={columns} aria-hidden="true">
              {months.map((month) => <span key={month.key}>{month.label}</span>)}
            </div>
          </div>
        </div>
        <details className="account-calendar-details">
          <summary>daily counts</summary>
          <p>All attempts count, including DNFs. Dates use your local timezone. Colours are relative to active days in this period.</p>
          <p>Colour levels: 0, 1–{thresholds[0]}, {thresholds[0] + 1}–{thresholds[1]}, {thresholds[1] + 1}–{thresholds[2]}, and {thresholds[2] + 1}+ solves.</p>
          <div className="account-calendar-table-scroll" role="region" aria-label="Daily counts table" tabIndex={0}>
            <table>
              <caption className="sr-only">Daily solve counts in {period}</caption>
              <thead><tr><th scope="col">date</th><th scope="col">solves</th></tr></thead>
              <tbody>
                {days.toReversed().map((day) => (
                  <tr key={day.key}>
                    <th scope="row"><time dateTime={day.key}>{formatAccountDate(day.date)}</time></th>
                    <td>{day.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  )
}
