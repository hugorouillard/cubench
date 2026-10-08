/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('cubing/scramble', () => ({
  randomScrambleForEvent: vi.fn(async () => ({ toString: (): string => "R U R'" })),
}))
// Keep the real useTimer; solve-history rendering is unrelated to these guards.
vi.mock('../../session/SessionPanel', () => ({ SessionPanel: () => null }))

const account = {
  id: 1,
  username: 'cuber',
  display_name: 'Cuber',
  bio: '',
  created_at: '2026-01-01T00:00:00Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function holdAndReleaseSpace() {
  fireEvent.keyDown(document.body, { code: 'Space' })
  act(() => vi.advanceTimersByTime(400))
  fireEvent.keyUp(document.body, { code: 'Space' })
}

async function renderTimer() {
  render(<App initialTheme="catppuccin-mocha" />)
  await screen.findByRole('button', { name: 'Account menu for Cuber' })
  await screen.findByText("R U R'")
  vi.useFakeTimers()
}

describe('authentication and timer integration', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/auth/session') return jsonResponse(account)
      if (String(input) === '/api/solves') {
        return jsonResponse({ ...JSON.parse(String(init?.body)), created_at: '2026-01-01T00:00:01Z' }, 201)
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('blocks Space while the account menu is open and resumes timing after dismissal', async () => {
    await renderTimer()
    fireEvent.pointerEnter(screen.getByRole('navigation', { name: 'Account' }), { pointerType: 'mouse' })
    expect(screen.getByRole('button', { name: 'sign out' })).toBeTruthy()
    holdAndReleaseSpace()
    expect(screen.getByText('hold space to start')).toBeTruthy()

    fireEvent.pointerDown(document.body)
    holdAndReleaseSpace()
    expect(screen.getByText('space to stop')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1_000))
    await act(async () => fireEvent.keyDown(document.body, { code: 'Space' }))
    expect(screen.getByText('hold space for next solve')).toBeTruthy()
    const solveRequests = vi.mocked(globalThis.fetch).mock.calls.filter(([path]) => String(path) === '/api/solves')
    expect(solveRequests).toHaveLength(1)
  })

  it('blocks timing during logout and starts a fresh guest timer on success', async () => {
    await renderTimer()
    let resolveLogout!: (response: Response) => void
    vi.mocked(globalThis.fetch).mockImplementation(() => new Promise((resolve) => { resolveLogout = resolve }))
    fireEvent.pointerEnter(screen.getByRole('navigation', { name: 'Account' }), { pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
    expect(screen.getByRole('button', { name: 'Timer' }).hasAttribute('disabled')).toBe(true)
    holdAndReleaseSpace()
    expect(screen.getByText('hold space to start')).toBeTruthy()

    await act(async () => resolveLogout(new Response(null, { status: 204 })))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    holdAndReleaseSpace()
    expect(screen.getByText('space to stop')).toBeTruthy()
  })
})
