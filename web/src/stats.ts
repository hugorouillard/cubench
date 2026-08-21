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

export type SolveDateRange = 'day' | 'week' | 'month' | 'threeMonths' | 'all'

export type DatedSolveRecord = {
  durationMs: number
  achievedAt: string
  solveId: string
}

export type LifetimeProfileSummary = {
  loggedCount: number
  successfulCount: number
  totalRawDurationMs: number
  earliestSolveAt: string | null
  totalActiveDays: number
  currentStreak: number
  longestStreak: number
  bestSingle: DatedSolveRecord | null
  bestAo5: DatedSolveRecord | null
  bestAo12: DatedSolveRecord | null
}

export type SolveHistoryPoint = {
  solveId: string
  recordedAt: string
  singleMs: number | null
  ao5Ms: number | null
  ao12Ms: number | null
  pbSingleMs: number | null
}

export type DailyAnalyticsPoint = {
  dateKey: string
  label: string
  attemptCount: number
  dnfCount: number
  nonDnfMeanMs: number | null
  nonDnfBestMs: number | null
}

export type DurationHistogramBucket = {
  startMs: number
  endMs: number
  label: string
  count: number
}

const DAY_MS = 24 * 60 * 60 * 1000

const RANGE_DURATION_MS: Record<Exclude<SolveDateRange, 'all'>, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  threeMonths: 90 * DAY_MS,
}

export function completedDuration(solve: Solve): number | null {
  if (solve.penalty === 'dnf') return null
  return effectiveDuration(solve.duration_ms, solve.penalty)
}

function compareSolveOrder(left: Solve, right: Solve): number {
  const timestampDifference =
    new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime()
  if (timestampDifference !== 0) return timestampDifference
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

function chronologicalSolves(solves: Solve[]): Solve[] {
  return [...solves].sort(compareSolveOrder)
}

export function newestSolvesFirst(solves: readonly Solve[]): Solve[] {
  return [...solves].sort((left, right) => compareSolveOrder(right, left))
}

export function filterSolves(
  solves: Solve[],
  range: SolveDateRange,
  selectedSessionIds: readonly string[] | null = null,
  now: Date = new Date(),
): Solve[] {
  const selectedSessions = selectedSessionIds === null
    ? null
    : new Set(selectedSessionIds)
  const nowTimestamp = now.getTime()
  const earliestTimestamp = range === 'all'
    ? Number.NEGATIVE_INFINITY
    : nowTimestamp - RANGE_DURATION_MS[range]

  return solves
    .filter((solve) => {
      if (selectedSessions !== null && !selectedSessions.has(solve.session_id)) return false
      if (range === 'all') return true
      const timestamp = new Date(solve.recorded_at).getTime()
      return timestamp >= earliestTimestamp && timestamp <= nowTimestamp
    })
    .sort((left, right) => compareSolveOrder(right, left))
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

function localDaySerial(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
}

function dateLabel(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
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
      label: dateLabel(key),
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

function datedRecord(durationMs: number, solve: Solve): DatedSolveRecord {
  return {
    durationMs,
    achievedAt: solve.recorded_at,
    solveId: solve.id,
  }
}

export function lifetimeProfileSummary(
  solves: Solve[],
  now: Date = new Date(),
): LifetimeProfileSummary {
  const chronological = chronologicalSolves(solves)
  const activeDays = [...new Set(solves.map((solve) => localDaySerial(new Date(solve.recorded_at))))]
    .sort((left, right) => left - right)
  let longestStreak = 0
  let streak = 0
  let previousDay: number | null = null

  for (const day of activeDays) {
    streak = previousDay !== null && day === previousDay + 1 ? streak + 1 : 1
    longestStreak = Math.max(longestStreak, streak)
    previousDay = day
  }

  const today = localDaySerial(now)
  const latestDay = activeDays.at(-1)
  let currentStreak = 0
  if (latestDay === today || latestDay === today - 1) {
    currentStreak = 1
    for (let index = activeDays.length - 2; index >= 0; index -= 1) {
      if (activeDays[index] !== activeDays[index + 1] - 1) break
      currentStreak += 1
    }
  }

  let bestSingle: DatedSolveRecord | null = null
  let bestAo5: DatedSolveRecord | null = null
  let bestAo12: DatedSolveRecord | null = null

  for (let index = 0; index < chronological.length; index += 1) {
    const solve = chronological[index]
    const duration = completedDuration(solve)
    if (duration !== null && (bestSingle === null || duration < bestSingle.durationMs)) {
      bestSingle = datedRecord(duration, solve)
    }

    if (index >= 4) {
      const average = trimmedAverage(chronological.slice(index - 4, index + 1))
      if (average !== null && (bestAo5 === null || average < bestAo5.durationMs)) {
        bestAo5 = datedRecord(average, solve)
      }
    }

    if (index >= 11) {
      const average = trimmedAverage(chronological.slice(index - 11, index + 1))
      if (average !== null && (bestAo12 === null || average < bestAo12.durationMs)) {
        bestAo12 = datedRecord(average, solve)
      }
    }
  }

  return {
    loggedCount: solves.length,
    successfulCount: solves.filter((solve) => solve.penalty !== 'dnf').length,
    totalRawDurationMs: solves.reduce((sum, solve) => sum + solve.duration_ms, 0),
    earliestSolveAt: chronological[0]?.recorded_at ?? null,
    totalActiveDays: activeDays.length,
    currentStreak,
    longestStreak,
    bestSingle,
    bestAo5,
    bestAo12,
  }
}

export function solveHistory(solves: Solve[]): SolveHistoryPoint[] {
  const chronological = chronologicalSolves(solves)
  let pbSingleMs: number | null = null

  return chronological.map((solve, index) => {
    const singleMs = completedDuration(solve)
    if (singleMs !== null && (pbSingleMs === null || singleMs < pbSingleMs)) {
      pbSingleMs = singleMs
    }

    return {
      solveId: solve.id,
      recordedAt: solve.recorded_at,
      singleMs,
      ao5Ms: index < 4
        ? null
        : trimmedAverage(chronological.slice(index - 4, index + 1)),
      ao12Ms: index < 11
        ? null
        : trimmedAverage(chronological.slice(index - 11, index + 1)),
      pbSingleMs,
    }
  })
}

export function dailyAnalytics(solves: Solve[]): DailyAnalyticsPoint[] {
  const days = new Map<string, { attempts: number; dnfCount: number; durations: number[] }>()

  for (const solve of solves) {
    const key = localDateKey(new Date(solve.recorded_at))
    const day = days.get(key) ?? { attempts: 0, dnfCount: 0, durations: [] }
    const duration = completedDuration(solve)
    day.attempts += 1
    if (duration === null) day.dnfCount += 1
    else day.durations.push(duration)
    days.set(key, day)
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, day]) => ({
      dateKey,
      label: dateLabel(dateKey),
      attemptCount: day.attempts,
      dnfCount: day.dnfCount,
      nonDnfMeanMs: day.durations.length
        ? Math.round(
          day.durations.reduce((sum, duration) => sum + duration, 0) / day.durations.length,
        )
        : null,
      nonDnfBestMs: day.durations.length ? Math.min(...day.durations) : null,
    }))
}

function wholeSecondBucketSize(rangeMs: number): number {
  const rawSizeSeconds = Math.max(1, rangeMs / 10 / 1000)
  const magnitude = 10 ** Math.floor(Math.log10(rawSizeSeconds))
  const normalizedSize = rawSizeSeconds / magnitude
  const factor = [1, 2, 5, 10].find((candidate) => candidate >= normalizedSize) ?? 10
  return factor * magnitude * 1000
}

export function solveDurationHistogram(solves: Solve[]): DurationHistogramBucket[] {
  const durations = solves
    .map(completedDuration)
    .filter((duration): duration is number => duration !== null)
  if (durations.length === 0) return []

  const minimum = Math.min(...durations)
  const maximum = Math.max(...durations)
  const bucketSize = wholeSecondBucketSize(maximum - minimum)
  const firstBucketStart = Math.floor(minimum / bucketSize) * bucketSize
  const bucketCount = Math.floor((maximum - firstBucketStart) / bucketSize) + 1
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = firstBucketStart + index * bucketSize
    const endMs = startMs + bucketSize
    return {
      startMs,
      endMs,
      label: `${startMs / 1000}-${endMs / 1000}s`,
      count: 0,
    }
  })

  for (const duration of durations) {
    const index = Math.floor((duration - firstBucketStart) / bucketSize)
    buckets[index].count += 1
  }

  return buckets
}
