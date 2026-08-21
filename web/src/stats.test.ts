import { describe, expect, it } from 'vitest'
import {
  bestAverage,
  currentAverage,
  dailyAnalytics,
  filterSolves,
  lifetimeProfileSummary,
  newestSolvesFirst,
  personalBestHistory,
  solveDurationHistogram,
  solveHistory,
  summarizeSolves,
  trimmedAverage,
} from './stats'
import type { Penalty, Solve } from './types'

function solve(durationMs: number, penalty: Penalty = 'none', index = 0): Solve {
  return {
    id: String(index),
    session_id: 'session',
    duration_ms: durationMs,
    penalty,
    scramble: 'R U',
    recorded_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }
}

function solveAt(
  id: string,
  durationMs: number,
  recordedAt: Date,
  sessionId = 'session',
  penalty: Penalty = 'none',
): Solve {
  return {
    id,
    session_id: sessionId,
    duration_ms: durationMs,
    penalty,
    scramble: 'R U',
    recorded_at: recordedAt.toISOString(),
    created_at: recordedAt.toISOString(),
  }
}

describe('solve ordering', () => {
  it('sorts newest first with a stable id tie-breaker without mutating its input', () => {
    const timestamp = new Date(Date.UTC(2026, 7, 21, 12))
    const older = solveAt('older', 10_000, new Date(Date.UTC(2026, 7, 20, 12)))
    const tiedA = solveAt('a', 11_000, timestamp)
    const tiedB = solveAt('b', 12_000, timestamp)
    const input = [older, tiedA, tiedB]

    expect(newestSolvesFirst(input).map(({ id }) => id)).toEqual(['b', 'a', 'older'])
    expect(input.map(({ id }) => id)).toEqual(['older', 'a', 'b'])
  })
})

describe('trimmedAverage', () => {
  it('drops the fastest and slowest results', () => {
    const solves = [10, 11, 12, 13, 14].map((seconds, index) =>
      solve(seconds * 1000, 'none', index),
    )
    expect(trimmedAverage(solves)).toBe(12_000)
  })

  it('allows one DNF but rejects two', () => {
    const oneDnf = [
      solve(10_000),
      solve(11_000),
      solve(12_000),
      solve(13_000),
      solve(14_000, 'dnf'),
    ]
    expect(trimmedAverage(oneDnf)).toBe(12_000)
    expect(trimmedAverage([...oneDnf.slice(0, 3), solve(13_000, 'dnf'), solve(14_000, 'dnf')])).toBeNull()
  })
})

describe('session statistics', () => {
  const solves = Array.from({ length: 12 }, (_, index) =>
    solve((10 + index) * 1000, 'none', index),
  )

  it('calculates current and best averages', () => {
    expect(currentAverage(solves, 5)).toBe(12_000)
    expect(bestAverage(solves, 5)).toBe(12_000)
  })

  it('builds a summary', () => {
    const summary = summarizeSolves(solves)
    expect(summary.count).toBe(12)
    expect(summary.bestSingle).toBe(10_000)
    expect(summary.currentAo12).toBe(15_500)
  })

  it('tracks each new personal best chronologically', () => {
    const history = personalBestHistory([
      solve(9_000, 'none', 2),
      solve(11_000, 'none', 0),
      solve(10_000, 'none', 1),
    ])
    expect(history.map((record) => record.durationMs)).toEqual([11_000, 10_000, 9_000])
  })
})

describe('profile solve filters', () => {
  const now = new Date('2026-04-01T12:00:00.000Z')
  const solves = [
    solveAt('new-b', 10_000, new Date('2026-04-01T11:00:00.000Z'), 'b'),
    solveAt('new-a', 10_000, new Date('2026-04-01T11:00:00.000Z'), 'a'),
    solveAt('day-edge', 10_000, new Date('2026-03-31T12:00:00.000Z'), 'a'),
    solveAt('outside-day', 10_000, new Date('2026-03-31T11:59:59.999Z'), 'a'),
    solveAt('week-edge', 10_000, new Date('2026-03-25T12:00:00.000Z'), 'b'),
    solveAt('month-edge', 10_000, new Date('2026-03-02T12:00:00.000Z'), 'a'),
    solveAt('three-month-edge', 10_000, new Date('2026-01-01T12:00:00.000Z'), 'b'),
    solveAt('old', 10_000, new Date('2025-12-31T12:00:00.000Z'), 'a'),
  ]

  it('uses rolling inclusive date ranges and deterministic newest-first order', () => {
    expect(filterSolves(solves, 'day', null, now).map(({ id }) => id)).toEqual([
      'new-b',
      'new-a',
      'day-edge',
    ])
    expect(filterSolves(solves, 'week', null, now).map(({ id }) => id)).toContain(
      'week-edge',
    )
    expect(filterSolves(solves, 'month', null, now).map(({ id }) => id)).toContain(
      'month-edge',
    )
    expect(filterSolves(solves, 'threeMonths', null, now).map(({ id }) => id)).toContain(
      'three-month-edge',
    )
  })

  it('treats null as all sessions and filters selected sessions', () => {
    expect(filterSolves(solves, 'all', ['b'], now).every(
      ({ session_id }) => session_id === 'b',
    )).toBe(true)
    expect(filterSolves(solves, 'all', [], now)).toEqual([])
    expect(filterSolves(solves, 'all', null, now)).toHaveLength(solves.length)
  })
})

describe('lifetime profile summary', () => {
  it('uses one cross-session stream with adjusted WCA averages and earliest ties', () => {
    const solves = Array.from({ length: 12 }, (_, index) => {
      const penalty: Penalty = index === 0 ? 'plus2' : index === 4 ? 'dnf' : 'none'
      const rawDuration = index === 0 ? 8_000 : index === 4 ? 50_000 : 10_000
      return solveAt(
        `solve-${index}`,
        rawDuration,
        new Date(Date.UTC(2026, 0, index + 1, 12)),
        index % 2 === 0 ? 'session-a' : 'session-b',
        penalty,
      )
    })

    const summary = lifetimeProfileSummary(
      [...solves].reverse(),
      new Date('2026-01-12T18:00:00.000Z'),
    )

    expect(summary).toMatchObject({
      loggedCount: 12,
      successfulCount: 11,
      totalRawDurationMs: 158_000,
      earliestSolveAt: solves[0].recorded_at,
      totalActiveDays: 12,
      currentStreak: 12,
      longestStreak: 12,
      bestSingle: {
        durationMs: 10_000,
        achievedAt: solves[0].recorded_at,
        solveId: 'solve-0',
      },
      bestAo5: {
        durationMs: 10_000,
        achievedAt: solves[4].recorded_at,
        solveId: 'solve-4',
      },
      bestAo12: {
        durationMs: 10_000,
        achievedAt: solves[11].recorded_at,
        solveId: 'solve-11',
      },
    })
  })

  it('calculates gap-aware streaks active through today or yesterday', () => {
    const solves = [
      solveAt('one', 10_000, new Date(2026, 7, 1, 12)),
      solveAt('two', 10_000, new Date(2026, 7, 2, 12), 'session', 'dnf'),
      solveAt('four', 10_000, new Date(2026, 7, 4, 12)),
      solveAt('five', 10_000, new Date(2026, 7, 5, 12)),
    ]

    expect(lifetimeProfileSummary(solves, new Date(2026, 7, 5, 20))).toMatchObject({
      totalActiveDays: 4,
      currentStreak: 2,
      longestStreak: 2,
    })
    expect(lifetimeProfileSummary(solves, new Date(2026, 7, 6, 8)).currentStreak).toBe(2)
    expect(lifetimeProfileSummary(solves, new Date(2026, 7, 7, 8)).currentStreak).toBe(0)
  })
})

describe('profile history', () => {
  it('returns adjusted singles, rolling averages, and running PBs chronologically', () => {
    const solves = Array.from({ length: 12 }, (_, index) => solveAt(
      `solve-${String(index).padStart(2, '0')}`,
      index === 0 ? 10_000 : index === 1 ? 9_000 : 11_000,
      new Date(Date.UTC(2026, 1, index + 1)),
      index % 2 === 0 ? 'a' : 'b',
      index === 0 ? 'plus2' : index === 4 ? 'dnf' : 'none',
    ))

    const history = solveHistory([...solves].reverse())

    expect(history.map(({ solveId }) => solveId)).toEqual(solves.map(({ id }) => id))
    expect(history[0]).toMatchObject({ singleMs: 12_000, pbSingleMs: 12_000 })
    expect(history[1]).toMatchObject({ singleMs: 9_000, pbSingleMs: 9_000 })
    expect(history[4]).toMatchObject({ singleMs: null, ao5Ms: 11_333 })
    expect(history[11]).toMatchObject({ ao12Ms: 11_100, pbSingleMs: 9_000 })
  })
})

describe('daily analytics', () => {
  it('counts all attempts while calculating adjusted non-DNF results', () => {
    const firstDay = new Date(2026, 5, 10, 12)
    const secondDay = new Date(2026, 5, 11, 12)
    const analytics = dailyAnalytics([
      solveAt('one', 10_000, firstDay),
      solveAt('two', 9_000, firstDay, 'session', 'plus2'),
      solveAt('three', 8_000, firstDay, 'session', 'dnf'),
      solveAt('four', 7_000, secondDay, 'session', 'dnf'),
    ])

    expect(analytics[0]).toMatchObject({
      attemptCount: 3,
      dnfCount: 1,
      nonDnfMeanMs: 10_500,
      nonDnfBestMs: 10_000,
    })
    expect(analytics[1]).toMatchObject({
      attemptCount: 1,
      dnfCount: 1,
      nonDnfMeanMs: null,
      nonDnfBestMs: null,
    })
  })
})

describe('solve duration histogram', () => {
  it('uses dynamic whole-second buckets for adjusted non-DNF durations', () => {
    const solves = [
      solveAt('one', 10_200, new Date(2026, 0, 1)),
      solveAt('two', 11_000, new Date(2026, 0, 2), 'session', 'plus2'),
      solveAt('dnf', 20_000, new Date(2026, 0, 3), 'session', 'dnf'),
      solveAt('three', 31_200, new Date(2026, 0, 4)),
    ]

    const buckets = solveDurationHistogram(solves)

    expect(buckets.map(({ startMs, endMs, label, count }) => ({
      startMs,
      endMs,
      label,
      count,
    }))).toEqual([
      { startMs: 10_000, endMs: 15_000, label: '10-15s', count: 2 },
      { startMs: 15_000, endMs: 20_000, label: '15-20s', count: 0 },
      { startMs: 20_000, endMs: 25_000, label: '20-25s', count: 0 },
      { startMs: 25_000, endMs: 30_000, label: '25-30s', count: 0 },
      { startMs: 30_000, endMs: 35_000, label: '30-35s', count: 1 },
    ])
    expect(solveDurationHistogram([
      solveAt('dnf', 10_000, new Date(2026, 0, 1), 'session', 'dnf'),
    ])).toEqual([])
  })
})
