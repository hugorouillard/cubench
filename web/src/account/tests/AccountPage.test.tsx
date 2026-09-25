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
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/profile' && init?.method === 'PATCH') return Response.json({ ...profile, display_name: 'Updated Cuber' })
      if (String(input) === '/api/profile') return Response.json(profile)
      if (String(input) === '/api/solves') return Response.json([solve])
      throw new Error(`Unexpected request: ${input}`)
    })
    const callbacks = props()
    callbacks.onPenalty.mockResolvedValue({ ...solve, penalty: 'plus2' })
    callbacks.onDelete.mockResolvedValue(true)
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
    expect(callbacks.onDelete).toHaveBeenCalledWith({ ...solve, penalty: 'plus2' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    const editor = screen.getByRole('dialog')
    fireEvent.change(within(editor).getByRole('textbox', { name: 'display name' }), { target: { value: 'Updated Cuber' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'save profile' }))
    await screen.findByRole('heading', { name: 'Updated Cuber' })
    expect(callbacks.onProfileChange).toHaveBeenCalledWith({ ...profile, display_name: 'Updated Cuber' })
    expect(fetch.mock.calls.map(([path]) => String(path))).toEqual(['/api/profile', '/api/solves', '/api/profile'])
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
    expect(within(bests).getByText('ao50').nextElementSibling?.textContent).toBe('10.00')
    expect(within(bests).getAllByRole('time').map((time) => time.getAttribute('dateTime'))).toEqual([
      solves[0].recorded_at, solves[4].recorded_at, solves[11].recorded_at,
    ])
    const recent = screen.getByRole('region', { name: 'recent solves' })
    expect(within(recent).getAllByRole('row')).toHaveLength(11)
    fireEvent.click(within(recent).getByRole('button', { name: 'load more' }))
    expect(within(recent).getAllByRole('row')).toHaveLength(21)
  })
})
