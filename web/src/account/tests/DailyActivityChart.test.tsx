/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aggregateDailyActivity, summarizeActivity } from '../../solves/activity'
import type { Solve } from '../../types'
import { DailyActivityChart } from '../DailyActivityChart'

function attempt(id: string, date = new Date(2026, 7, 21, 12), penalty: Solve['penalty'] = 'none'): Solve {
  return { id, recorded_at: date.toISOString(), created_at: date.toISOString(), duration_ms: 10_000, scramble: 'R U', penalty }
}

function props(solves: Solve[] = [], today = '2026-08-21', firstYear = 2025) {
  const activity = aggregateDailyActivity(solves)
  return { activity, today, firstYear, summary: summarizeActivity(activity, today) }
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('daily activity chart', () => {
  it('switches ranges, including a leap-year calendar with 54 weeks', () => {
    render(<DailyActivityChart {...props([], '2028-12-31')} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Activity range' }), { target: { value: '2028' } })
    expect(screen.getByRole('img', { name: /^0 solves in 2028\./ })).toBeTruthy()
    expect(document.querySelector<HTMLElement>('.account-calendar-grid')?.style.gridTemplateColumns)
      .toBe('repeat(54, minmax(0, 1fr))')
  })

  it('updates counts on deletion, but counts penalties and DNFs as attempts', () => {
    const { rerender } = render(<DailyActivityChart {...props([attempt('a'), attempt('b', undefined, 'dnf')])} />)
    expect(screen.getByTitle('21 Aug 2026: 2 solves')).toBeTruthy()
    rerender(<DailyActivityChart {...props([attempt('a', undefined, 'plus2'), attempt('b', undefined, 'dnf')])} />)
    expect(screen.getByTitle('21 Aug 2026: 2 solves')).toBeTruthy()
    rerender(<DailyActivityChart {...props([attempt('a')])} />)
    expect(screen.getByTitle('21 Aug 2026: 1 solve')).toBeTruthy()
  })

  it('initializes and changes the viewport only on mount or deliberate range changes', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    const { container, rerender } = render(<DailyActivityChart {...props([attempt('a')])} />)
    const scroll = container.querySelector<HTMLElement>('.account-calendar-scroll')!
    expect(scroll.scrollLeft).toBe(800)
    scroll.scrollLeft = 50
    rerender(<DailyActivityChart {...props([attempt('a', undefined, 'plus2')])} />)
    expect(scroll.scrollLeft).toBe(50)
    rerender(<DailyActivityChart {...props([])} />)
    expect(scroll.scrollLeft).toBe(50)
    rerender(<DailyActivityChart {...props([], '2026-08-22')} />)
    expect(scroll.scrollLeft).toBe(50)
    fireEvent.change(screen.getByRole('combobox', { name: 'Activity range' }), { target: { value: '2025' } })
    expect(scroll.scrollLeft).toBe(800)
  })

  it('provides exact daily values without hundreds of keyboard stops', () => {
    const { container, rerender } = render(<DailyActivityChart {...props([attempt('a', undefined, 'dnf')])} />)
    const details = container.querySelector('details')!
    details.open = true
    const table = screen.getByRole('table', { name: 'Daily solve counts in the last 12 months' })
    expect(within(table).getAllByRole('row')).toHaveLength(366)
    expect(within(table).getByRole('row', { name: '21 Aug 2026 1' })).toBeTruthy()
    expect(within(table).getByRole('row', { name: '20 Aug 2026 0' })).toBeTruthy()
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
    rerender(<DailyActivityChart {...props([])} />)
    expect(within(table).getByRole('row', { name: '21 Aug 2026 0' })).toBeTruthy()
    expect(details.open).toBe(true)
  })

  it('retains the selected year when its last backdated solve is deleted', () => {
    const { rerender } = render(<DailyActivityChart {...props([attempt('a', new Date(2023, 0, 1, 12))], '2026-08-21', 2023)} />)
    const range = screen.getByRole('combobox', { name: 'Activity range' })
    fireEvent.change(range, { target: { value: '2023' } })
    rerender(<DailyActivityChart {...props([], '2026-08-21', 2025)} />)
    expect(within(range).getByRole('option', { name: '2023' })).toBeTruthy()
    expect((range as HTMLSelectElement).value).toBe('2023')
    expect(screen.getByRole('img', { name: /^0 solves in 2023\./ })).toBeTruthy()
  })
})
