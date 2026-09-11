/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="bar-chart" />,
  Chart: () => <div data-testid="mixed-chart" />,
  Line: () => <div data-testid="line-chart" />,
}))

import { ProfileView } from './ProfileView'

describe('profile view', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
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
    expect(screen.getByText("R U R'")).toBeTruthy()
    expect(fetch.mock.calls.map(([path]) => String(path))).toEqual([
      '/api/profile',
      '/api/solves',
    ])
  })
})
