import {
  localDate,
  localDateKey,
  localDaySerial,
} from "../dates/localCalendar";
import type { Solve } from "../types";

export type SolveCountByDay = ReadonlyMap<string, number>;
export type ActivitySummary = {
  totalActiveDays: number;
  currentStreak: number;
  longestStreak: number;
};

export function countSolvesByDay(solves: readonly Solve[]): SolveCountByDay {
  const counts = new Map<string, number>();
  for (const solve of solves) {
    const date_key = localDateKey(new Date(solve.recorded_at));
    counts.set(date_key, (counts.get(date_key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Calculates active-day count and streaks through today.
 * The current streak remains active if you practiced yesterday.
 */
export function summarizeActivity(
  counts: SolveCountByDay,
  todayKey: string,
): ActivitySummary {
  const today = localDaySerial(localDate(todayKey));
  // Future-dated attempts must not interrupt today's streak or extend lifetime streaks.
  const activeDays = [...counts.keys()]
    .map((key) => localDaySerial(localDate(key)))
    .filter((day) => day <= today)
    .sort((a, b) => a - b);
  let longestStreak = 0;
  let streak = 0;
  let previousDay: number | null = null;
  for (const day of activeDays) {
    streak = previousDay !== null && day === previousDay + 1 ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previousDay = day;
  }
  return {
    totalActiveDays: activeDays.length,
    currentStreak:
      previousDay === today || previousDay === today - 1 ? streak : 0,
    longestStreak,
  };
}
