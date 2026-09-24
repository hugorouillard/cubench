import { describe, expect, it } from 'vitest'
import { createProfilePreview } from './profilePreview'
import { filterSolves, lifetimeProfileSummary } from './stats'

describe('profile preview', () => {
  it('provides sparse, reproducible practice throughout the last year', () => {
    const now = new Date(2026, 8, 24, 12)
    const { profile, solves } = createProfilePreview(now)
    const activeDays = new Set(solves.map((solve) => new Date(solve.recorded_at).toDateString()))
    const oldestSolve = new Date(solves.at(-1)!.recorded_at)
    const localDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
    const activePeriods = new Set(solves.map((solve) =>
      Math.floor((localDay(now) - localDay(new Date(solve.recorded_at))) * 12 / 365)))

    expect(createProfilePreview(now)).toEqual({ profile, solves })
    expect(solves.length).toBeGreaterThanOrEqual(120)
    expect(solves.length).toBeLessThanOrEqual(155)
    expect(activeDays.size).toBeGreaterThanOrEqual(25)
    expect(activeDays.size).toBeLessThanOrEqual(40)
    expect(activePeriods.size).toBe(12)
    expect(oldestSolve.getTime()).toBeLessThan(now.getTime() - 330 * 86_400_000)
    expect(new Date(profile.created_at).getTime()).toBeLessThan(oldestSolve.getTime())
    expect(solves.every((solve) => new Date(solve.recorded_at) <= now)).toBe(true)
    expect(new Set(solves.map((solve) => solve.scramble)).size).toBe(solves.length)
    expect(new Set(solves.map((solve) => solve.penalty))).toEqual(new Set(['none', 'plus2', 'dnf']))

    for (const range of ['day', 'week', 'month', 'threeMonths', 'all'] as const) {
      expect(filterSolves(solves, range, now).length).toBeGreaterThan(0)
    }
    expect(filterSolves(solves, 'day', now).length).toBeGreaterThanOrEqual(6)
    expect(filterSolves(solves, 'week', now).length).toBeGreaterThanOrEqual(12)
    expect(filterSolves(solves, 'threeMonths', now).length).toBeLessThan(solves.length)
    expect(lifetimeProfileSummary(solves, now).currentStreak).toBeGreaterThanOrEqual(2)
  })

  it('keeps today and yesterday active even just after midnight', () => {
    const now = new Date(2026, 8, 24, 0, 0, 1)
    const { solves } = createProfilePreview(now)
    const today = now.toDateString()
    const yesterday = new Date(2026, 8, 23).toDateString()

    expect(solves.filter((solve) => new Date(solve.recorded_at).toDateString() === today))
      .toHaveLength(1)
    expect(solves.some((solve) => new Date(solve.recorded_at).toDateString() === yesterday))
      .toBe(true)
    expect(solves.every((solve) => new Date(solve.recorded_at) <= now)).toBe(true)
    expect(lifetimeProfileSummary(solves, now).currentStreak).toBeGreaterThanOrEqual(2)
  })
})
