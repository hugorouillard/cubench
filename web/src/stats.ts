import { effectiveDuration } from './timer'
import type { Solve } from './types'

export type SolveSummary = {
  count: number
  dnfCount: number
  mean: number | null
  bestSingle: number | null
  currentAo5: number | null
  bestAo5: number | null
  currentAo12: number | null
  bestAo12: number | null
}

export type DailyProgress = {
  key: string
  label: string
  count: number
  mean: number
  best: number
}

export type PersonalBest = {
  solve: Solve
  durationMs: number
}

export function completedDuration(solve: Solve): number | null {
  if (solve.penalty === 'dnf') return null
  return effectiveDuration(solve.duration_ms, solve.penalty)
}

export function trimmedAverage(solves: Solve[]): number | null {
  if (solves.length < 3) return null

  const results = solves
    .map((solve) => completedDuration(solve) ?? Number.POSITIVE_INFINITY)
    .sort((left, right) => left - right)
    .slice(1, -1)

  if (results.some((result) => !Number.isFinite(result))) return null
  return Math.round(results.reduce((sum, result) => sum + result, 0) / results.length)
}

export function currentAverage(solves: Solve[], size: number): number | null {
  if (solves.length < size) return null
  return trimmedAverage(solves.slice(0, size))
}

export function bestAverage(solves: Solve[], size: number): number | null {
  if (solves.length < size) return null

  let best: number | null = null
  for (let index = 0; index <= solves.length - size; index += 1) {
    const average = trimmedAverage(solves.slice(index, index + size))
    if (average !== null && (best === null || average < best)) best = average
  }
  return best
}

export function summarizeSolves(solves: Solve[]): SolveSummary {
  const completed = solves
    .map(completedDuration)
    .filter((duration): duration is number => duration !== null)
  const mean = completed.length
    ? Math.round(completed.reduce((sum, duration) => sum + duration, 0) / completed.length)
    : null

  return {
    count: solves.length,
    dnfCount: solves.length - completed.length,
    mean,
    bestSingle: completed.length ? Math.min(...completed) : null,
    currentAo5: currentAverage(solves, 5),
    bestAo5: bestAverage(solves, 5),
    currentAo12: currentAverage(solves, 12),
    bestAo12: bestAverage(solves, 12),
  }
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dailyProgress(solves: Solve[]): DailyProgress[] {
  const days = new Map<string, number[]>()

  for (const solve of solves) {
    const duration = completedDuration(solve)
    if (duration === null) continue
    const key = localDateKey(new Date(solve.recorded_at))
    days.set(key, [...(days.get(key) ?? []), duration])
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, durations]) => ({
      key,
      label: new Date(`${key}T12:00:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      }),
      count: durations.length,
      mean: Math.round(
        durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
      ),
      best: Math.min(...durations),
    }))
}

export function personalBestHistory(solves: Solve[]): PersonalBest[] {
  let best = Number.POSITIVE_INFINITY
  const history: PersonalBest[] = []

  const chronological = [...solves].sort(
    (left, right) =>
      new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime(),
  )
  for (const solve of chronological) {
    const duration = completedDuration(solve)
    if (duration !== null && duration < best) {
      best = duration
      history.push({ solve, durationMs: duration })
    }
  }
  return history
}
