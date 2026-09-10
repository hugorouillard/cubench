import { describe, expect, it } from 'vitest'
import {
  effectiveDuration,
  formatInspectionTime,
  formatTime,
  inspectionPenalty,
  togglePenalty,
} from './timer'

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

describe('togglePenalty', () => {
  it('toggles a selected penalty without changing the raw duration', () => {
    expect(togglePenalty('none', 'plus2')).toBe('plus2')
    expect(togglePenalty('plus2', 'plus2')).toBe('none')
  })

  it('replaces the existing penalty', () => {
    expect(togglePenalty('dnf', 'plus2')).toBe('plus2')
    expect(togglePenalty('plus2', 'dnf')).toBe('dnf')
  })
})

describe('inspectionPenalty', () => {
  it('applies penalties after the 15 and 17 second limits', () => {
    expect(inspectionPenalty(15_000)).toBe('none')
    expect(inspectionPenalty(15_001)).toBe('plus2')
    expect(inspectionPenalty(17_000)).toBe('plus2')
    expect(inspectionPenalty(17_001)).toBe('dnf')
  })

  it('formats the countdown using whole seconds', () => {
    expect(formatInspectionTime(0)).toBe('15')
    expect(formatInspectionTime(1)).toBe('15')
    expect(formatInspectionTime(1_000)).toBe('14')
    expect(formatInspectionTime(15_000)).toBe('0')
    expect(formatInspectionTime(15_001)).toBe('+2')
    expect(formatInspectionTime(17_001)).toBe('DNF')
  })
})
