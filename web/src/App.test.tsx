/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SolveStore } from './solveStore'
import type { Penalty, Solve } from './types'

const scramble = vi.hoisted(() => ({ random: vi.fn() }))
const timer = vi.hoisted(() => ({
  onComplete: null as ((durationMs: number, penalty: Penalty) => void) | null,
  reset: vi.fn(),
}))
const account = {
  id: 1,
  username: 'speedcuber',
  display_name: 'Speed Cuber',
  bio: '',
  created_at: '2026-01-01T00:00:00Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ detail: 'Not authenticated' }, 401),
    )
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open')
    }
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    )
    scramble.random
      .mockReset()
      .mockResolvedValue({ toString: () => 'F R U' })
      .mockResolvedValueOnce({ toString: () => "R U R'" })
  })

  it('keeps guest solves in memory after checking the session', async () => {
    const fetch = vi.mocked(globalThis.fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")

    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })

    await waitFor(() => expect(screen.getByTestId('solve-count').textContent).toBe('1'))
    expect(fetch.mock.calls.map(([path]) => String(path))).toEqual(['/api/auth/session'])
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'clear times' }))
    expect(screen.getByTestId('solve-count').textContent).toBe('0')
  })

  it('updates and deletes guest solves without solve API requests', async () => {
    const fetch = vi.mocked(globalThis.fetch)

    render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")
    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })

    fireEvent.click(await screen.findByRole('button', { name: 'add penalty' }))
    await waitFor(() => expect(screen.getByTestId('solve-penalty').textContent).toBe('plus2'))
    fireEvent.click(screen.getByRole('button', { name: 'delete solve' }))
    await waitFor(() => expect(screen.getByTestId('solve-count').textContent).toBe('0'))
    expect(fetch.mock.calls.map(([path]) => String(path))).toEqual(['/api/auth/session'])
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

  it('clears the guest session and persists new solves after sign in', async () => {
    let failNextSolve = false
    const fetch = vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === '/api/auth/session') return jsonResponse({ detail: 'Not authenticated' }, 401)
      if (path === '/api/auth/login') return jsonResponse(account)
      if (path === '/api/solves') {
        if (failNextSolve) return jsonResponse({ detail: 'Not authenticated' }, 401)
        const solve = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({ ...solve, created_at: '2026-01-01T00:00:01Z' }, 201)
      }
      if (path === '/api/auth/logout') return new Response(null, { status: 204 })
      throw new Error(`Unexpected request: ${path}`)
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")
    await act(async () => {
      timer.onComplete?.(12_340, 'none')
    })
    await waitFor(() => expect(screen.getByTestId('solve-count').textContent).toBe('1'))

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('username'), {
      target: { value: 'speedcuber' },
    })
    fireEvent.change(within(dialog).getByLabelText('password'), {
      target: { value: 'test-password' },
    })
    fireEvent.click(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!)

    await screen.findByText('Speed Cuber')
    expect(screen.getByLabelText('Signed in as Speed Cuber')).toBeTruthy()
    expect(screen.getByTestId('solve-count').textContent).toBe('0')
    await act(async () => {
      timer.onComplete?.(11_000, 'none')
    })
    await waitFor(() => expect(screen.getByTestId('solve-count').textContent).toBe('1'))
    expect(fetch.mock.calls.map(([path]) => String(path))).toContain('/api/solves')
    fireEvent.click(screen.getByRole('button', { name: 'clear times' }))
    expect(confirm).toHaveBeenCalledWith(
      'Clear 1 current solve? Saved solves remain in your profile.',
    )
    expect(screen.getByTestId('solve-count').textContent).toBe('0')

    failNextSolve = true
    await act(async () => {
      timer.onComplete?.(10_000, 'none')
    })
    await screen.findByRole('button', { name: 'Retry saving result' })
    confirm.mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Retry saving result' })).toBeTruthy()

    confirm.mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('button', { name: /sign in/i })
    expect(screen.getByTestId('solve-count').textContent).toBe('0')
  })

  it('keeps the account dialog open while sign in is pending', async () => {
    let resolveLogin!: (response: Response) => void
    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      if (String(input) === '/api/auth/session') {
        return Promise.resolve(jsonResponse({ detail: 'Not authenticated' }, 401))
      }
      return new Promise<Response>((resolve) => {
        resolveLogin = resolve
      })
    })
    render(<App initialTheme="catppuccin-mocha" />)
    await screen.findByText("R U R'")

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('username'), {
      target: { value: 'speedcuber' },
    })
    fireEvent.change(within(dialog).getByLabelText('password'), {
      target: { value: 'test-password' },
    })
    fireEvent.click(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!)
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))

    expect(dialog.hasAttribute('open')).toBe(true)
    resolveLogin(jsonResponse(account))
    await screen.findByText('Speed Cuber')
  })

  it('restores an account session', async () => {
    const fetch = vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(account))

    render(<App initialTheme="catppuccin-mocha" />)

    await screen.findByText('Speed Cuber')
    expect(fetch).toHaveBeenCalledWith('/api/auth/session', expect.anything())
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
