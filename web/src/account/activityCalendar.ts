import { addCalendarDays, localDate, localDateKey, previousYearDate } from '../dates/localCalendar'
import type { ActivityByDay } from '../solves/activity'

export type ActivityRange = { kind: 'rolling' } | { kind: 'year'; year: number }
export type ActivityDay = { date: Date; key: string; count: number; inRange: boolean }
export type ActivityLevel = 0 | 1 | 2 | 3 | 4

/** Sunday-first weeks, with invisible padding outside the inclusive selected range. */
export function buildActivityCalendar(activity: ActivityByDay, range: ActivityRange, todayKey: string) {
  const today = localDate(todayKey)
  // The day after last year's clamped anniversary through today, inclusively.
  const start = range.kind === 'rolling' ? addCalendarDays(previousYearDate(today), 1) : new Date(range.year, 0, 1, 12)
  const end = range.kind === 'rolling' ? new Date(today) : new Date(range.year, 11, 31, 12)
  if (end > today) end.setTime(today.getTime())
  if (start > end) return { weeks: [], cells: [], months: [], totalAttempts: 0 }

  const calendarStart = new Date(start)
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay())
  const calendarEnd = new Date(end)
  calendarEnd.setDate(calendarEnd.getDate() + 6 - calendarEnd.getDay())

  const cells: ActivityDay[] = []
  for (const cursor = new Date(calendarStart); cursor <= calendarEnd; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor)
    const key = localDateKey(date)
    const inRange = date >= start && date <= end
    cells.push({ date, key, count: inRange ? activity.get(key)?.attemptCount ?? 0 : 0, inRange })
  }
  const weeks: ActivityDay[][] = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))
  const months = weeks.map((week, index) => {
    const first = week.find((day) => day.inRange && day.date.getDate() === 1)
    const month = first ?? (index === 0 ? week.find((day) => day.inRange) : undefined)
    return { key: week[0].key, label: month?.date.toLocaleDateString('en-GB', { month: 'short' }) ?? '' }
  })

  return { weeks, cells, months, totalAttempts: cells.reduce((total, cell) => total + cell.count, 0) }
}

export function activityThresholds(counts: readonly number[]): number[] {
  const sorted = [...counts].sort((a, b) => a - b)
  const trim = Math.round(sorted.length * 0.1)
  const middle = trim ? sorted.slice(trim, -trim) : sorted
  const mean = middle.length ? middle.reduce((total, count) => total + count, 0) / middle.length : 0
  return [Math.floor(mean / 2), Math.round(mean), Math.round(mean * 1.5)]
}

export function activityLevel(count: number, thresholds: readonly number[]): ActivityLevel {
  if (count === 0) return 0
  const threshold = thresholds.findIndex((value) => count <= value)
  return (threshold === -1 ? 4 : threshold + 1) as ActivityLevel
}
