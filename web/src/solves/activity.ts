import { localDate, localDateKey, localDaySerial } from '../dates/localCalendar'
import { effectiveDuration } from '../timer/timer'
import type { Solve } from '../types'

export type DailyActivity = {
  dateKey: string
  attemptCount: number
  dnfCount: number
  nonDnfMeanMs: number | null
  nonDnfBestMs: number | null
}
export type ActivityByDay = ReadonlyMap<string, DailyActivity>
export type ActivitySummary = {
  totalActiveDays: number
  currentStreak: number
  longestStreak: number
}

/** All attempts (including DNFs) are activity; duration statistics exclude DNFs. */
export function aggregateDailyActivity(solves: readonly Solve[]): ActivityByDay {
  const days = new Map<string, { attempts: number; dnfs: number; totalMs: number; bestMs: number | null }>()
  for (const solve of solves) {
    const key = localDateKey(new Date(solve.recorded_at))
    const day = days.get(key) ?? { attempts: 0, dnfs: 0, totalMs: 0, bestMs: null }
    day.attempts += 1
    if (solve.penalty === 'dnf') day.dnfs += 1
    else {
      const duration = effectiveDuration(solve.duration_ms, solve.penalty)
      day.totalMs += duration
      day.bestMs = day.bestMs === null ? duration : Math.min(day.bestMs, duration)
    }
    days.set(key, day)
  }
  return new Map([...days].sort(([a], [b]) => a.localeCompare(b)).map(([dateKey, day]) => [dateKey, {
    dateKey,
    attemptCount: day.attempts,
    dnfCount: day.dnfs,
    nonDnfMeanMs: day.attempts > day.dnfs ? Math.round(day.totalMs / (day.attempts - day.dnfs)) : null,
    nonDnfBestMs: day.bestMs,
  }]))
}

export function summarizeActivity(activity: ActivityByDay, todayKey: string): ActivitySummary {
  const today = localDaySerial(localDate(todayKey))
  // Future-dated attempts must not interrupt today's streak or extend lifetime streaks.
  const activeDays = [...activity.keys()]
    .map((key) => localDaySerial(localDate(key)))
    .filter((day) => day <= today)
    .sort((a, b) => a - b)
  let longestStreak = 0
  let streak = 0
  let previousDay: number | null = null
  for (const day of activeDays) {
    streak = previousDay !== null && day === previousDay + 1 ? streak + 1 : 1
    longestStreak = Math.max(longestStreak, streak)
    previousDay = day
  }
  return {
    totalActiveDays: activeDays.length,
    currentStreak: previousDay === today || previousDay === today - 1 ? streak : 0,
    longestStreak,
  }
}
