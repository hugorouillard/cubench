/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Penalty, SolveInput } from './types'

const api = vi.hoisted(() => ({
  clearSolves: vi.fn(),
  createSolve: vi.fn(),
  deleteSolve: vi.fn(),
  getExportData: vi.fn(),
  getProfile: vi.fn(),
  getSessions: vi.fn(),
  getSolves: vi.fn(),
  updateSolve: vi.fn(),
}))
const scramble = vi.hoisted(() => ({ random: vi.fn() }))
const timer = vi.hoisted(() => ({
  onComplete: null as ((durationMs: number, penalty: Penalty) => void) | null,
  reset: vi.fn(),
}))

vi.mock('./api', () => api)
vi.mock('cubing/scramble', () => ({ randomScrambleForEvent: scramble.random }))
vi.mock('./SessionPanel', () => ({ SessionPanel: () => null }))
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

describe('solve persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    timer.onComplete = null
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    )
    api.getProfile.mockResolvedValue({
      id: 1,
      display_name: 'Cube Solver',
      bio: '',
      created_at: '2026-01-01T00:00:00Z',
    })
    api.getSessions.mockResolvedValue([{
      id: 'session',
      name: 'main',
      created_at: '2026-01-01T00:00:00Z',
    }])
    api.getSolves.mockResolvedValue([])
    scramble.random
      .mockResolvedValueOnce({ toString: () => "R U R'" })
      .mockResolvedValueOnce({ toString: () => 'F R U' })
  })

  it('retains a failed solve and retries it before advancing the scramble', async () => {
    api.createSolve
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (solve: SolveInput) => ({
        ...solve,
        created_at: '2026-01-01T00:00:01Z',
      }))

    render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")

    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })

    await screen.findByRole('button', { name: 'Retry saving result' })
    expect(screen.getByText("R U R'")).toBeTruthy()
    expect(scramble.random).toHaveBeenCalledTimes(1)

    const originalSolve = api.createSolve.mock.calls[0][0]
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving result' }))

    await waitFor(() => expect(api.createSolve).toHaveBeenCalledTimes(2))
    expect(api.createSolve.mock.calls[1][0]).toEqual(originalSolve)
    await screen.findByText('F R U')
    expect(screen.queryByRole('button', { name: 'Retry saving result' })).toBeNull()
  })
})
