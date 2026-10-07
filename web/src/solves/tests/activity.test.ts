import { describe, expect, it } from 'vitest'
import type { Solve } from '../../types'
import { aggregateDailyActivity, summarizeActivity } from '../activity'

function attempt(id: string, date: Date, penalty: Solve['penalty'] = 'none'): Solve {
  return { id, recorded_at: date.toISOString(), created_at: date.toISOString(), duration_ms: 10_000, scramble: 'R U', penalty }
}

describe('daily activity aggregation', () => {
  it('counts all attempts on local days, adjusting +2 durations but excluding DNF durations', () => {
    const days = aggregateDailyActivity([
      attempt('d', new Date(2026, 7, 21, 13), 'plus2'),
      attempt('a', new Date(2026, 7, 20, 23, 59)),
      attempt('b', new Date(2026, 7, 21, 0, 0)),
      attempt('c', new Date(2026, 7, 21, 12), 'dnf'),
    ])
    expect([...days.keys()]).toEqual(['2026-08-20', '2026-08-21'])
    expect(days.get('2026-08-20')?.attemptCount).toBe(1)
    expect(days.get('2026-08-21')).toEqual({
      dateKey: '2026-08-21', attemptCount: 3, dnfCount: 1, nonDnfMeanMs: 11_000, nonDnfBestMs: 10_000,
    })
    expect(aggregateDailyActivity([]).size).toBe(0)
  })

  it('keeps DNF-only days as activity without duration statistics', () => {
    const days = aggregateDailyActivity([attempt('a', new Date(2026, 7, 21), 'dnf')])
    expect(days.get('2026-08-21')).toMatchObject({ attemptCount: 1, dnfCount: 1, nonDnfMeanMs: null, nonDnfBestMs: null })
    expect(summarizeActivity(days, '2026-08-21')).toEqual({ totalActiveDays: 1, currentStreak: 1, longestStreak: 1 })
  })

  it('handles streak gaps, grace through yesterday, and future-dated attempts', () => {
    const days = aggregateDailyActivity([1, 2, 4, 5, 10].map((day) => attempt(String(day), new Date(2026, 7, day))))
    expect(summarizeActivity(days, '2026-08-05')).toEqual({ totalActiveDays: 4, currentStreak: 2, longestStreak: 2 })
    expect(summarizeActivity(days, '2026-08-06').currentStreak).toBe(2)
    expect(summarizeActivity(days, '2026-08-07').currentStreak).toBe(0)
    expect(summarizeActivity(new Map(), '2026-08-07')).toEqual({ totalActiveDays: 0, currentStreak: 0, longestStreak: 0 })
  })

  it.each([[2, 7], [2, 28], [9, 24], [9, 31]])('keeps streaks across DST boundaries (month %i day %i)', (month, start) => {
    const dates = [0, 1, 2].map((offset) => new Date(2026, month, start + offset, 12))
    const days = aggregateDailyActivity(dates.map((date, index) => attempt(String(index), date)))
    expect(summarizeActivity(days, [...days.keys()].at(-1)!)).toEqual({ totalActiveDays: 3, currentStreak: 3, longestStreak: 3 })
  })
})
