/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProfilePreview, type ProfilePreview } from '../profilePreview'
import { lifetimeProfileSummary } from '../../solves/stats'
import type { Solve } from '../../types'
import { AccountPage } from '../AccountPage'

vi.mock('react-chartjs-2', () => ({
  Line: (props: { 'aria-label': string }) => <div role="img" aria-label={props['aria-label']} />,
}))

function props() {
  return { onPenalty: vi.fn(), onDelete: vi.fn(), onError: vi.fn(), onProfileChange: vi.fn() }
}

describe('account page', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders the sample account with real lifetime totals and no account mutations or fetching', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'))
    const preview = createProfilePreview()
    const summary = lifetimeProfileSummary(preview.solves)
    render(<AccountPage preview={preview} {...props()} />)

    expect(screen.getByRole('heading', { name: preview.profile.display_name })).toBeTruthy()
    const totals = screen.getByRole('group', { name: 'Lifetime totals' })
    expect(within(totals).getByText('total solves').nextElementSibling?.textContent)
      .toBe(summary.loggedCount.toLocaleString())
    expect(within(totals).getByText('active days').nextElementSibling?.textContent)
      .toBe(summary.totalActiveDays.toLocaleString())
    expect(screen.getByLabelText('Level unavailable')).toBeTruthy()
    expect(screen.getByText(/Current streak \d+ days/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Personal bests' })).toBeTruthy()
    const progression = await screen.findByRole('region', { name: 'progression' })
    expect(within(progression).getByRole('group', { name: 'Progression series' })).toBeTruthy()
    expect(within(progression).getByRole('img', { name: /completed solves/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'recent solves' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /edit profile|toggle .* penalty|delete .* solve|export/i })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads an account, edits it, and updates totals after changing and deleting a solve', async () => {
    const recorded_at = '2026-01-02T12:00:00Z'
    const solve: Solve = {
      id: 'solve-1', duration_ms: 12_340, penalty: 'none', scramble: "R U R'",
      recorded_at, created_at: recorded_at,
    }
    const profile = { id: 1, display_name: 'Speed Cuber', bio: 'Practicing lookahead.', created_at: '2026-01-01T00:00:00Z' }
    let current: Solve[] = [solve]
    let revision = 1
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/profile' && init?.method === 'PATCH') return Response.json({ ...profile, display_name: 'Updated Cuber' })
      if (String(input) === '/api/account/dashboard') return Response.json({
        profile, summary: {
          revision, solve_count: current.length, completed_count: current.filter((item) => item.penalty !== 'dnf').length,
          total_duration_ms: current.reduce((sum, item) => sum + item.duration_ms, 0),
          best_single_ms: current.length ? 12_340 : null,
          best_single_at: current.length ? recorded_at : null,
          best_single_id: current.length ? solve.id : null,
          best_ao5_ms: null, best_ao12_ms: null, best_ao50_ms: null,
          active_days: current.length ? 1 : 0, current_streak: 0, longest_streak: current.length ? 1 : 0,
        },
        activity: current.length ? [{ day: '2026-01-02', attempts: 1 }] : [],
        progression: current.filter((item) => item.penalty !== 'dnf').map((item) => ({
          id: item.id, recorded_at, attempt_number: 1, single_ms: item.duration_ms,
          pb_single_ms: item.duration_ms, mean_5_ms: null, mean_12_ms: null, mean_50_ms: null,
        })),
        recent: { revision, solves: current.map((item) => ({ ...item, is_pb: true })), next_cursor: null },
      })
      throw new Error(`Unexpected request: ${input}`)
    })
    const callbacks = props()
    callbacks.onPenalty.mockImplementation(async () => {
      current = [{ ...solve, penalty: 'plus2' }]
      revision += 1
      return current[0]
    })
    callbacks.onDelete.mockImplementation(async () => {
      current = []
      revision += 1
      return true
    })
    render(<AccountPage {...callbacks} />)

    await screen.findByRole('heading', { name: 'Speed Cuber' })
    await screen.findByRole('img', { name: /Progression of 1 completed solve/ })
    expect(screen.getAllByText('Practicing lookahead.')[0]).toBeTruthy()
    const totals = screen.getByRole('group', { name: 'Lifetime totals' })
    expect(within(totals).getByText('total solves').nextElementSibling?.textContent).toBe('1')
    expect(within(totals).getByText('time solving').nextElementSibling?.textContent).toBe('00:00:12')
    expect(within(totals).getByText('active days').nextElementSibling?.textContent).toBe('1')
    expect(screen.getByText("R U R'")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle +2 penalty for 12.34 solve' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Toggle +2 penalty for 12.34 solve' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete 12.34 solve' }))
    await screen.findByText('No solves yet. Your results will appear here after your first solve.')
    expect(screen.getByText('Your progression will appear after your first completed solve.')).toBeTruthy()
    expect(within(totals).getByText('total solves').nextElementSibling?.textContent).toBe('0')
    expect(callbacks.onDelete).toHaveBeenCalledWith({ ...solve, penalty: 'plus2', is_pb: true })
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    const editor = screen.getByRole('dialog')
    fireEvent.change(within(editor).getByRole('textbox', { name: 'display name' }), { target: { value: 'Updated Cuber' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'save profile' }))
    await screen.findByRole('heading', { name: 'Updated Cuber' })
    expect(callbacks.onProfileChange).toHaveBeenCalledWith({ ...profile, display_name: 'Updated Cuber' })
    expect(fetch.mock.calls.map(([path]) => String(path))).toEqual(['/api/account/dashboard', '/api/account/dashboard', '/api/account/dashboard', '/api/profile'])
  })

  it('uses account-wide totals and refreshes after a historical edit', async () => {
    const recorded_at = '2026-01-02T12:00:00Z'
    const solve: Solve = {
      id: 'solve-1', duration_ms: 12_340, penalty: 'none', scramble: 'R U',
      recorded_at, created_at: recorded_at,
    }
    let edited = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/account/dashboard') return Response.json({
        profile: { id: 1, display_name: 'Solver', bio: '', created_at: recorded_at },
        summary: {
          revision: edited ? 2 : 1, solve_count: edited ? 1 : 2,
          total_duration_ms: edited ? 12_340 : 25_000,
          best_single_ms: edited ? 14_340 : 10_000, best_single_at: recorded_at, best_single_id: solve.id,
          best_ao5_ms: null, best_ao12_ms: null, best_ao50_ms: null,
          active_days: 1, current_streak: 0, longest_streak: 1,
        },
        activity: [{ day: '2026-01-02', attempts: edited ? 1 : 2 }],
        progression: [{ id: solve.id, recorded_at, attempt_number: 1, single_ms: edited ? 14_340 : 12_340,
          pb_single_ms: edited ? 14_340 : 10_000, mean_5_ms: null, mean_12_ms: null, mean_50_ms: null }],
        recent: { revision: edited ? 2 : 1, solves: [{ ...solve, penalty: edited ? 'plus2' : 'none', is_pb: true }], next_cursor: null },
      })
      throw new Error(`Unexpected request: ${input}`)
    })
    const callbacks = props()
    callbacks.onPenalty.mockImplementation(async () => { edited = true; return { ...solve, penalty: 'plus2' } })
    render(<AccountPage {...callbacks} />)

    const totals = await screen.findByRole('group', { name: 'Lifetime totals' })
    await waitFor(() => expect(within(totals).getByText('total solves').nextElementSibling?.textContent).toBe('2'))
    expect(within(screen.getByRole('region', { name: 'Personal bests' })).getByText('single').nextElementSibling?.textContent).toBe('10.00')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle +2 penalty for 12.34 solve' }))
    await waitFor(() => expect(within(totals).getByText('total solves').nextElementSibling?.textContent).toBe('1'))
  })

  it('loads older activity and recent solves without downloading the full account history', async () => {
    const profile = { id: 1, display_name: 'Solver', bio: '', created_at: '2025-01-01T00:00:00Z' }
    const solves: Solve[] = Array.from({ length: 11 }, (_, index) => ({
      id: `solve-${index}`, duration_ms: 10_000 + index, penalty: 'none',
      scramble: `R U ${index}`, recorded_at: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
      created_at: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    }))
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path === '/api/account/dashboard') return Response.json({
        profile,
        summary: { revision: 11, solve_count: 11, total_duration_ms: 110_055,
          best_single_ms: 10_000, best_single_at: solves[0].recorded_at, best_single_id: solves[0].id,
          best_ao5_ms: null, best_ao12_ms: null, best_ao50_ms: null,
          active_days: 11, current_streak: 0, longest_streak: 11 },
        activity: [], progression: [],
        recent: { revision: 11, solves: solves.toReversed().slice(0, 10).map((solve) => ({ ...solve, is_pb: false })), next_cursor: solves[1].id },
      })
      if (path === '/api/account/recent?cursor=solve-1&revision=11') return Response.json({
        revision: 11, solves: [{ ...solves[0], is_pb: true }], next_cursor: null,
      })
      if (path === '/api/account/activity?year=2025&revision=11') return Response.json([
        { day: '2025-01-01', attempts: 1 },
      ])
      throw new Error(`Unexpected request: ${path}`)
    })
    render(<AccountPage {...props()} />)

    await screen.findByRole('heading', { name: 'Solver' })
    const recent = screen.getByRole('region', { name: 'recent solves' })
    expect(within(recent).getAllByRole('row')).toHaveLength(11)
    fireEvent.click(within(recent).getByRole('button', { name: 'load more' }))
    await waitFor(() => expect(within(recent).getAllByRole('row')).toHaveLength(12))
    const activity = screen.getByRole('region', { name: 'Activity' })
    fireEvent.change(within(activity).getByRole('combobox', { name: 'Activity range' }), { target: { value: '2025' } })
    await waitFor(() => expect(within(activity).getByRole('img', { name: /^1 solves in 2025/ })).toBeTruthy())
    expect(fetch.mock.calls.map(([path]) => String(path))).toEqual([
      '/api/account/dashboard', '/api/account/recent?cursor=solve-1&revision=11',
      '/api/account/activity?year=2025&revision=11',
    ])
  })

  it('switches calendar ranges and shows a leap-year calendar with 54 weeks', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2028, 11, 31, 12))
    render(<AccountPage preview={{
      profile: { id: 1, display_name: 'Solver', bio: '', created_at: new Date(2028, 0, 1, 12).toISOString() },
      solves: [],
    }} {...props()} />)

    const activity = screen.getByRole('region', { name: 'Activity' })
    fireEvent.change(within(activity).getByRole('combobox', { name: 'Activity range' }), { target: { value: '2028' } })
    expect(within(activity).getByRole('img', { name: /^0 solves in 2028\./ })).toBeTruthy()
    expect(activity.querySelector<HTMLElement>('.account-calendar-grid')?.style.gridTemplateColumns)
      .toBe('repeat(54, minmax(0, 1fr))')
  })

  it('shows dated records and pages recent solves without affecting lifetime bests', () => {
    const solves: Solve[] = Array.from({ length: 52 }, (_, index) => {
      const timestamp = new Date(Date.UTC(2025, 0, index + 1)).toISOString()
      return {
        id: `solve-${index}`, duration_ms: index === 51 ? 11_000 : 10_000,
        penalty: index === 50 ? 'dnf' : index === 51 ? 'plus2' : 'none',
        scramble: "R U R'", recorded_at: timestamp, created_at: timestamp,
      }
    })
    const preview: ProfilePreview = {
      profile: { id: 1, display_name: 'Solver', bio: '', created_at: '2025-01-01T00:00:00Z' },
      solves: solves.toReversed(),
    }
    render(<AccountPage preview={preview} {...props()} />)

    const bests = screen.getByRole('region', { name: 'Personal bests' })
    expect(within(bests).getByText('single').nextElementSibling?.textContent).toBe('10.00')
    expect(within(bests).getByText('WCA ao50').nextElementSibling?.textContent).toBe('10.00')
    expect(within(bests).getAllByRole('time').map((time) => time.getAttribute('dateTime'))).toEqual([
      solves[0].recorded_at, solves[4].recorded_at, solves[11].recorded_at, solves[49].recorded_at,
    ])
    const recent = screen.getByRole('region', { name: 'recent solves' })
    expect(within(recent).getAllByRole('row')).toHaveLength(11)
    fireEvent.click(within(recent).getByRole('button', { name: 'load more' }))
    expect(within(recent).getAllByRole('row')).toHaveLength(21)
  })
})
