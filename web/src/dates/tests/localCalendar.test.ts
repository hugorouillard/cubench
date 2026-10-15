import { describe, expect, it } from 'vitest'
import { addCalendarDays, localDate, localDateKey, localDaySerial, previousYearDate } from '../localCalendar'

describe('local calendar dates', () => {
  it('round-trips local dates without treating date keys as UTC', () => {
    expect(localDateKey(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
    expect(localDateKey(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31')
    expect(localDateKey(localDate('2026-01-01'))).toBe('2026-01-01')
    expect(localDate('2026-01-01').getHours()).toBe(12)
  })

  it.each(['2026-03-07', '2026-03-28', '2026-10-24', '2026-10-31', '2026-12-31'])('advances days across DST and year boundaries: %s', (key) => {
    const date = localDate(key)
    const next = addCalendarDays(date, 1)
    expect(localDaySerial(next) - localDaySerial(date)).toBe(1)
    expect(next.getHours()).toBe(12)
    expect(localDateKey(date)).toBe(key)
  })

  it('clamps leap anniversaries without mutating the original date', () => {
    const leap = localDate('2028-02-29')
    expect(localDateKey(previousYearDate(leap))).toBe('2027-02-28')
    expect(localDateKey(leap)).toBe('2028-02-29')
  })
})
