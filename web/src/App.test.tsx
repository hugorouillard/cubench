/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SolveStore } from './solveStore'
import type { Penalty, Solve } from './types'

const scramble = vi.hoisted(() => ({ random: vi.fn() }))
const timer = vi.hoisted(() => ({
  onComplete: null as ((durationMs: number, penalty: Penalty) => void) | null,
  reset: vi.fn(),
}))

vi.mock('cubing/scramble', () => ({ randomScrambleForEvent: scramble.random }))
vi.mock('./SessionPanel', () => ({
  SessionPanel: ({
    solves,
    onPenalty,
    onDelete,
    onClear,
  }: {
    solves: Solve[]
    onPenalty: (solve: Solve, penalty: Penalty) => Promise<Solve | null>
    onDelete: (solve: Solve) => Promise<boolean>
    onClear: () => void
  }) => (
    <div>
      <span data-testid="solve-count">{solves.length}</span>
      <span data-testid="solve-penalty">{solves[0]?.penalty ?? ''}</span>
      {solves[0] && (
        <>
          <button type="button" onClick={() => void onPenalty(solves[0], 'plus2')}>
            add penalty
          </button>
          <button type="button" onClick={() => void onDelete(solves[0])}>
            delete solve
          </button>
        </>
      )}
      <button type="button" onClick={onClear}>clear times</button>
    </div>
  ),
}))
vi.mock('./useTimer', () => ({
  useTimer: (
    _enabled: boolean,
    _inspectionEnabled: boolean,
    onComplete: (durationMs: number, penalty: Penalty) => void,
  ) => {
    timer.onComplete = onComplete
    return { phase: 'stopped', elapsedMs: 12_340, reset: timer.reset }
  },
}))

import App from './App'

describe('current session', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    timer.onComplete = null
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    )
    scramble.random
      .mockReset()
      .mockResolvedValue({ toString: () => 'F R U' })
      .mockResolvedValueOnce({ toString: () => "R U R'" })
  })

  it('keeps guest solves in memory without calling the API', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")

    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })

    await waitFor(() => expect(screen.getByTestId('solve-count').textContent).toBe('1'))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('navigation', { name: 'Account' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'clear times' }))
    expect(screen.getByTestId('solve-count').textContent).toBe('0')
  })

  it('updates and deletes guest solves without calling the API', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')

    render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")
    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })

    fireEvent.click(await screen.findByRole('button', { name: 'add penalty' }))
    await waitFor(() => expect(screen.getByTestId('solve-penalty').textContent).toBe('plus2'))
    fireEvent.click(screen.getByRole('button', { name: 'delete solve' }))
    await waitFor(() => expect(screen.getByTestId('solve-count').textContent).toBe('0'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('starts a fresh guest session when remounted', async () => {
    const firstRender = render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")
    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })
    await waitFor(() => expect(screen.getByTestId('solve-count').textContent).toBe('1'))

    firstRender.unmount()
    render(<App initialTheme="catppuccin-mocha" />)

    expect(screen.getByTestId('solve-count').textContent).toBe('0')
  })

  it('retains a failed solve and retries it before advancing the scramble', async () => {
    const store: SolveStore = {
      create: vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (solve) => ({
        ...solve,
        created_at: '2026-01-01T00:00:01Z',
      })),
      update: vi.fn(),
      delete: vi.fn(),
    }

    render(<App initialTheme="catppuccin-mocha" solveStore={store} />)
    await screen.findByText("R U R'")

    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })

    await screen.findByRole('button', { name: 'Retry saving result' })
    expect(screen.getByText("R U R'")).toBeTruthy()
    expect(scramble.random).toHaveBeenCalledTimes(1)

    const originalSolve = vi.mocked(store.create).mock.calls[0][0]
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving result' }))

    await waitFor(() => expect(store.create).toHaveBeenCalledTimes(2))
    expect(vi.mocked(store.create).mock.calls[1][0]).toEqual(originalSolve)
    await screen.findByText('F R U')
    expect(screen.queryByRole('button', { name: 'Retry saving result' })).toBeNull()
  })
})
