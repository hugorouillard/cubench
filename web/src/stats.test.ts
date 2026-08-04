import { describe, expect, it } from 'vitest'
import {
  bestAverage,
  currentAverage,
  personalBestHistory,
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
