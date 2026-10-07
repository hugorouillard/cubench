import { describe, expect, it } from 'vitest'
import type { ActivityByDay } from '../../solves/activity'
import { activityLevel, activityThresholds, buildActivityCalendar } from '../activityCalendar'

function activity(entries: [string, number][] = []): ActivityByDay {
  return new Map(entries.map(([dateKey, attemptCount]) => [dateKey, {
    dateKey, attemptCount, dnfCount: 0, nonDnfMeanMs: null, nonDnfBestMs: null,
  }]))
}

describe('activity calendar layout', () => {
  it('includes both rolling boundaries and hides padding and future days', () => {
    const counts = activity([
      ['2025-08-21', 20], ['2025-08-22', 2], ['2026-08-21', 3], ['2026-08-22', 10],
    ])
    const calendar = buildActivityCalendar(counts, { kind: 'rolling' }, '2026-08-21')
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
    const calendar = buildActivityCalendar(activity(), { kind: 'year', year: 2028 }, '2028-12-31')
    expect(calendar.weeks).toHaveLength(54)
    expect(calendar.cells.filter((day) => day.inRange)).toHaveLength(366)
    expect(calendar.months.filter((month) => month.label).map((month) => month.label))
      .toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'])
  })

  it('clamps the previous anniversary on leap day before advancing one day', () => {
    const calendar = buildActivityCalendar(activity(), { kind: 'rolling' }, '2028-02-29')
    const days = calendar.cells.filter((day) => day.inRange)
    expect(days[0].key).toBe('2027-03-01')
    expect(days.at(-1)?.key).toBe('2028-02-29')
    expect(days).toHaveLength(366)
  })

  it('ends the current year at today and labels a partial opening month', () => {
    const currentYear = buildActivityCalendar(activity(), { kind: 'year', year: 2026 }, '2026-01-01')
    expect(currentYear.weeks).toHaveLength(1)
    expect(currentYear.cells.filter((day) => day.inRange).map((day) => day.key)).toEqual(['2026-01-01'])
    const rolling = buildActivityCalendar(activity(), { kind: 'rolling' }, '2026-08-21')
    expect(rolling.months[0].label).toBe('Aug')
  })

  it('includes a past year in full and never displays a future year', () => {
    const past = buildActivityCalendar(activity(), { kind: 'year', year: 2025 }, '2026-08-21')
    expect(past.cells.filter((day) => day.inRange)).toHaveLength(365)
    const future = buildActivityCalendar(activity(), { kind: 'year', year: 2027 }, '2026-08-21')
    expect(future.cells).toEqual([])
  })

  it('does not mutate inputs', () => {
    const counts = activity([['2026-08-21', 3]])
    const before = [...counts]
    buildActivityCalendar(counts, { kind: 'rolling' }, '2026-08-21')
    expect([...counts]).toEqual(before)
  })
})

describe('activity intensity', () => {
  it('ignores empty days when scaling sparse histories', () => {
    const counts = [1, 2, 4, 6, 8]
    expect(activityThresholds([...Array<number>(360).fill(0), ...counts])).toEqual(activityThresholds(counts))
    const levels = counts.map((count) => activityLevel(count, activityThresholds(counts)))
    expect(new Set(levels).size).toBeGreaterThan(1)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('has strictly increasing positive thresholds for empty and uniform histories', () => {
    for (const counts of [[], [0, 0], [1], [1, 1, 1], [10, 10, 10]]) {
      const [low, medium, high] = activityThresholds(counts)
      expect(low).toBeGreaterThan(0)
      expect(medium).toBeGreaterThan(low)
      expect(high).toBeGreaterThan(medium)
    }
    expect(activityLevel(1, activityThresholds([1]))).toBe(1)
  })

  it('trims isolated outliers without changing its input', () => {
    const counts = [1000, 4, 4, 4, 4, 4, 4, 4, 4, 1]
    const original = [...counts]
    expect(activityThresholds(counts)).toEqual([2, 4, 6])
    expect(counts).toEqual(original)
  })

  it('keeps empty days at level zero and classifies counts by thresholds', () => {
    expect(activityThresholds([])).toEqual([1, 2, 3])
    expect(activityThresholds([2, 4, 6])).toEqual([2, 4, 6])
    expect([0, 1, 3, 5, 7].map((count) => activityLevel(count, [2, 4, 6]))).toEqual([0, 1, 2, 3, 4])
  })
})
