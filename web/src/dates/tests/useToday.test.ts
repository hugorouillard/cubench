/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToday } from '../useToday'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('useToday', () => {
  it('updates at midnight and cleans up its timer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 21, 23, 59, 59))
    const { result, unmount } = renderHook(useToday)
    expect(result.current).toBe('2026-08-21')
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe('2026-08-22')
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['focus', 'visibilitychange'])('refreshes after waking via %s and reschedules midnight', (event) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 21, 12))
    const { result } = renderHook(useToday)
    vi.setSystemTime(new Date(2026, 7, 24, 23, 59, 59))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => (event === 'focus' ? window : document).dispatchEvent(new Event(event)))
    expect(result.current).toBe('2026-08-24')
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe('2026-08-25')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('schedules the next local midnight across a DST transition', () => {
    vi.useFakeTimers()
    const start = new Date(2026, 2, 8, 0)
    const end = new Date(2026, 2, 9, 0)
    vi.setSystemTime(start)
    const { result } = renderHook(useToday)
    act(() => vi.advanceTimersByTime(end.getTime() - start.getTime() - 1))
    expect(result.current).toBe('2026-03-08')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('2026-03-09')
  })
})
