/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionPanel } from '../SessionPanel'
import type { Solve } from '../../types'

vi.mock('../SessionChart', () => ({
  SessionChart: () => <div data-testid="session-chart" />,
}))

const solves: Solve[] = [
  {
    id: 'solve-2',
    duration_ms: 11_500,
    penalty: 'none',
    scramble: 'R U',
    recorded_at: '2026-09-22T12:05:00Z',
    created_at: '2026-09-22T12:05:00Z',
  },
  {
    id: 'solve-1',
    duration_ms: 12_000,
    penalty: 'none',
    scramble: 'F R',
    recorded_at: '2026-09-22T12:00:00Z',
    created_at: '2026-09-22T12:00:00Z',
  },
]

const defaultProps = {
  disabled: false,
  pendingSolveIds: [],
  theme: 'catppuccin-mocha',
  onPenalty: vi.fn(),
  onDelete: vi.fn(),
  onClear: vi.fn(),
}

describe('SessionPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('uses a compact history header and empty state', () => {
    render(<SessionPanel {...defaultProps} solves={[]} />)

    expect(screen.getByRole('heading', { name: 'history' })).toBeTruthy()
    expect(screen.getByText('Your solves will appear here.')).toBeTruthy()
    expect(screen.queryByText('current solves')).toBeNull()
    expect(screen.queryByText('newest first')).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear times' })).toBeTruthy()
  })

  it('reveals a solve action disclosure when its summary is selected', () => {
    render(<SessionPanel {...defaultProps} solves={solves} />)

    const summary = screen.getByTitle('Show actions for solve 2')
    expect(summary.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('best')).toBeNull()

    fireEvent.click(summary)

    expect(summary.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Actions for solve 2').parentElement?.className)
      .toContain('is-actions-visible')
  })

  it('waits for enough solves before drawing a trend', async () => {
    const thirdSolve: Solve = {
      id: 'solve-3',
      duration_ms: 11_000,
      penalty: 'none',
      scramble: 'U R',
      recorded_at: '2026-09-22T12:10:00Z',
      created_at: '2026-09-22T12:10:00Z',
    }

    const { rerender } = render(<SessionPanel {...defaultProps} solves={solves} />)

    expect(screen.getByText('1 more solve to draw')).toBeTruthy()
    expect(screen.queryByTestId('session-chart')).toBeNull()

    rerender(<SessionPanel {...defaultProps} solves={[thirdSolve, ...solves]} />)

    expect(await screen.findByTestId('session-chart')).toBeTruthy()
    expect(screen.queryByText('ao5')).toBeNull()
  })
})
