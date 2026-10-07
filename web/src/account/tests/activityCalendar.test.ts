import { describe, expect, it } from 'vitest'
import type { Solve } from '../../types'
import { activityLevel, activityThresholds, buildActivityCalendar, countActivityDays } from '../activityCalendar'

const now = new Date(2026, 7, 21, 12)

function attempt(id: string, date: Date, penalty: Solve['penalty'] = 'none'): Solve {
  return { id, recorded_at: date.toISOString(), created_at: date.toISOString(), duration_ms: 10_000, scramble: 'R U', penalty }
}

describe('daily activity aggregation', () => {
  it('counts all attempts, including penalties and DNFs, on browser-local days', () => {
    const counts = countActivityDays([
      attempt('a', new Date(2026, 7, 20, 23, 59)),
      attempt('b', new Date(2026, 7, 21, 0, 0)),
      attempt('c', new Date(2026, 7, 21, 12), 'dnf'),
      attempt('d', new Date(2026, 7, 21, 13), 'plus2'),
    ])
    expect([...counts]).toEqual([['2026-08-20', 1], ['2026-08-21', 3]])
    expect(countActivityDays([]).size).toBe(0)
  })
})

describe('activity calendar layout', () => {
  it('includes both rolling boundaries and hides padding and future days', () => {
    const counts = new Map([
      ['2025-08-21', 20], ['2025-08-22', 2], ['2026-08-21', 3], ['2026-08-22', 10],
    ])
    const calendar = buildActivityCalendar(counts, { kind: 'rolling' }, now)
    const inRange = calendar.cells.filter((day) => day.inRange)
    expect(inRange).toHaveLength(365)
    expect(inRange[0].key).toBe('2025-08-22')
    expect(inRange.at(-1)?.key).toBe('2026-08-21')
    expect(calendar.totalAttempts).toBe(5)
    expect(calendar.cells.filter((day) => !day.inRange).every((day) => day.count === 0)).toBe(true)
    expect(calendar.weeks.every((week) => week.length === 7 && week[0].date.getDay() === 0)).toBe(true)
    expect(new Set(calendar.cells.map((day) => day.key)).size).toBe(calendar.cells.length)
  })

  it('lays out a 54-week leap year with every date and twelve month labels', () => {
    const calendar = buildActivityCalendar(new Map(), { kind: 'year', year: 2028 }, new Date(2028, 11, 31, 12))
    expect(calendar.weeks).toHaveLength(54)
    expect(calendar.cells.filter((day) => day.inRange)).toHaveLength(366)
    expect(calendar.months.filter((month) => month.label).map((month) => month.label))
      .toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'])
  })

  it('ends the current year at today and labels a partial opening month', () => {
    const currentYear = buildActivityCalendar(new Map(), { kind: 'year', year: 2026 }, new Date(2026, 0, 1, 12))
    expect(currentYear.weeks).toHaveLength(1)
    expect(currentYear.cells.filter((day) => day.inRange).map((day) => day.key)).toEqual(['2026-01-01'])
    const rolling = buildActivityCalendar(new Map(), { kind: 'rolling' }, now)
    expect(rolling.months[0].label).toBe('Aug')
  })

  it('does not mutate inputs', () => {
    const date = new Date(now)
    const counts = new Map([['2026-08-21', 3]])
    buildActivityCalendar(counts, { kind: 'rolling' }, date)
    expect(date).toEqual(now)
    expect([...counts]).toEqual([['2026-08-21', 3]])
  })
})

describe('activity intensity', () => {
  it('keeps empty days at level zero and classifies counts by thresholds', () => {
    expect(activityThresholds([])).toEqual([0, 0, 0])
    expect(activityThresholds([2, 4, 6])).toEqual([2, 4, 6])
    expect([0, 1, 3, 5, 7].map((count) => activityLevel(count, [2, 4, 6]))).toEqual([0, 1, 2, 3, 4])
  })
})
