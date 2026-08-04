import { describe, expect, it } from 'vitest'
import { effectiveDuration, formatTime } from './timer'

describe('formatTime', () => {
  it('truncates to centiseconds', () => {
    expect(formatTime(12_349)).toBe('12.34')
  })

  it('formats minutes and penalties', () => {
    expect(formatTime(63_456, 'plus2')).toBe('1:05.45')
    expect(effectiveDuration(10_000, 'plus2')).toBe(12_000)
  })

  it('formats a DNF', () => {
    expect(formatTime(9_000, 'dnf')).toBe('DNF')
  })
})
