const DAY_MS = 24 * 60 * 60 * 1000

/** Calendar days use the browser's local timezone, never UTC timestamp slicing. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local noon avoids UTC parsing of YYYY-MM-DD and midnight DST transitions. */
export function localDate(key: string): Date {
  return new Date(`${key}T12:00:00`)
}

/** Ordinal of a local calendar day; consecutive days stay adjacent across DST. */
export function localDaySerial(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** Clamp Feb 29 to Feb 28 rather than letting Date overflow into March. */
export function previousYearDate(date: Date): Date {
  const year = date.getFullYear() - 1
  const month = date.getMonth()
  const lastDay = new Date(year, month + 1, 0, 12).getDate()
  return new Date(year, month, Math.min(date.getDate(), lastDay), 12)
}
