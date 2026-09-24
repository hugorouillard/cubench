/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="bar-chart" />,
  Chart: () => <div data-testid="mixed-chart" />,
  Line: () => <div data-testid="line-chart" />,
}))

import { ProfileView } from './ProfileView'
import { createProfilePreview, type ProfilePreview } from './profilePreview'
import type { Solve } from './types'

describe('profile view', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('lets guests explore sample history without fetching or exposing account mutations', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'))
    const preview = createProfilePreview()
    render(
      <ProfileView
        preview={preview}
        onPenalty={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onError={vi.fn()}
        onProfileChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Sample solver' })).toBeTruthy()
    const logged = preview.solves.length
    const progress = logged % 100
    const nextMilestone = logged - progress + 100
    expect(screen.getByText(/Current streak \d+ days/)).toBeTruthy()
    const milestone = screen.getByRole('progressbar', {
      name: `${logged} solves logged; ${100 - progress} solves until ${nextMilestone} solves`,
    })
    expect(milestone.getAttribute('value')).toBe(String(progress))
    expect(milestone.parentElement?.firstElementChild?.textContent).toBe(String(logged))
    expect(screen.getByText(`${progress}/100`)).toBeTruthy()
    const overview = screen.getByRole('region', { name: 'All-time 3×3 practice' })
    expect(Number(within(overview).getByText('active days').previousElementSibling?.textContent))
      .toBeGreaterThan(0)
    expect(within(overview).getByText('longest streak')).toBeTruthy()
    expect(within(overview).queryByText('current streak')).toBeNull()
    const personalBests = screen.getByRole('region', { name: 'Personal bests' })
    expect(within(personalBests).getAllByRole('time')).toHaveLength(3)
    expect(within(personalBests).getAllByText(/best (single|ao5|ao12|ao50)/)).toHaveLength(4)
    const currentForm = screen.getByRole('region', { name: 'Current form' })
    expect(within(currentForm).getAllByRole('time')).toHaveLength(1)
    expect(within(currentForm).getByText('last 25 mean')).toBeTruthy()
    const activity = screen.getByRole('region', { name: 'Activity' })
    expect(within(activity).getByRole('img', {
      name: new RegExp(`^${preview.solves.length} attempts in the last 12 months\\.`),
    })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /edit profile|export|toggle .* penalty|delete .* solve/i }))
      .toBeNull()
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'last week' }))
    expect(screen.getByRole('button', { name: 'last week' }).getAttribute('aria-pressed')).toBe('true')
    const filteredCount = screen.getByText(/showing \d+ of \d+/).textContent!
    expect(Number(filteredCount.split(' of ')[1])).toBeLessThan(preview.solves.length)
    expect(screen.getByTestId('line-chart')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'result' }))
    expect(screen.getByRole('columnheader', { name: 'result' }).getAttribute('aria-sort')).toBe('ascending')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads the account profile and lifetime solves', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path === '/api/profile') {
        return Response.json({
          id: 1,
          display_name: 'Speed Cuber',
          bio: 'Practicing lookahead.',
          created_at: '2026-01-01T00:00:00Z',
        })
      }
      if (path === '/api/solves') {
        return Response.json([{
          id: '00000000-0000-4000-8000-000000000001',
          duration_ms: 12_340,
          penalty: 'none',
          scramble: "R U R'",
          recorded_at: '2026-01-02T00:00:00Z',
          created_at: '2026-01-02T00:00:01Z',
        }])
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <ProfileView
        onPenalty={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onError={vi.fn()}
        onProfileChange={vi.fn()}
      />,
    )

    await screen.findByRole('heading', { name: 'Speed Cuber' })
    expect(screen.getAllByText('Practicing lookahead.')[0]).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Lifetime totals' })).getAllByText('1'))
      .toHaveLength(2)
    const milestone = screen.getByRole('progressbar', {
      name: '1 solve logged; 99 solves until 100 solves',
    })
    expect(milestone.getAttribute('value')).toBe('1')
    expect(milestone.parentElement?.firstElementChild?.textContent).toBe('1')
    expect(screen.queryByText(/Current streak/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeTruthy()
    expect(screen.getByText("R U R'")).toBeTruthy()
    const bests = screen.getByRole('region', { name: 'Personal bests' })
    expect(within(bests).getByText('best single').parentElement?.querySelector('strong')?.textContent).toBe('12.34')
    expect(within(bests).getByText('best ao50').parentElement?.querySelector('strong')?.textContent).toBe('--')
    const form = screen.getByRole('region', { name: 'Current form' })
    expect(within(form).getByText('latest result').parentElement?.querySelector('strong')?.textContent).toBe('12.34')
    for (const label of ['current ao5', 'current ao12', 'last 25 mean']) {
      expect(within(form).getByText(label).parentElement?.querySelector('strong')?.textContent).toBe('--')
    }
    expect(fetch.mock.calls.map(([path]) => String(path))).toEqual([
      '/api/profile',
      '/api/solves',
    ])
  })

  it('shows dated lifetime records and current-form figures from all solves regardless of analysis range', () => {
    const solves: Solve[] = Array.from({ length: 52 }, (_, index) => {
      const timestamp = new Date(Date.UTC(2025, 0, index + 1)).toISOString()
      return {
        id: `solve-${index}`,
        duration_ms: index === 51 ? 11_000 : 10_000,
        penalty: index === 50 ? 'dnf' : index === 51 ? 'plus2' : 'none',
        scramble: "R U R'",
        recorded_at: timestamp,
        created_at: timestamp,
      }
    })
    const preview: ProfilePreview = {
      profile: { id: 1, display_name: 'Solver', bio: '', created_at: '2025-01-01T00:00:00Z' },
      solves: solves.toReversed(),
    }
    render(
      <ProfileView
        preview={preview}
        onPenalty={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onError={vi.fn()}
        onProfileChange={vi.fn()}
      />,
    )

    const bests = screen.getByRole('region', { name: 'Personal bests' })
    const form = screen.getByRole('region', { name: 'Current form' })
    const value = (region: HTMLElement, label: string) =>
      within(region).getByText(label).parentElement?.querySelector('strong')?.textContent
    expect(bests.querySelectorAll('.profile-pb-record')).toHaveLength(4)
    expect(form.querySelectorAll('.profile-pb-record')).toHaveLength(4)
    expect(within(bests).getByRole('heading', { name: 'Personal bests' }).classList.contains('profile-sr-only')).toBe(true)
    for (const label of ['best single', 'best ao5', 'best ao12', 'best ao50']) {
      expect(value(bests, label)).toBe('10.00')
    }
    expect(within(bests).getAllByRole('time').map((time) => time.getAttribute('dateTime'))).toEqual([
      solves[0].recorded_at,
      solves[4].recorded_at,
      solves[11].recorded_at,
    ])
    expect(within(bests).getByText('50 consecutive attempts')).toBeTruthy()
    expect(value(form, 'latest result')).toBe('13.00')
    expect(within(form).getByRole('time').getAttribute('dateTime')).toBe(solves[51].recorded_at)
    expect(value(form, 'current ao5')).toBe('11.00')
    expect(value(form, 'current ao12')).toBe('10.30')
    expect(value(form, 'last 25 mean')).toBe('10.12')
    expect(within(form).getByText('non-DNF solves')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'last week' }))
    expect(screen.getAllByText('No solves match the current filters.')).toHaveLength(2)
    expect(value(bests, 'best ao50')).toBe('10.00')
    expect(value(form, 'last 25 mean')).toBe('10.12')
  })
})
