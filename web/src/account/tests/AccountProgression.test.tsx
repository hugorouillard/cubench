/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ChartData, ChartOptions } from 'chart.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Solve } from '../../types'
import { AccountProgression } from '../HistoryChart'

const lineChart = vi.hoisted(() => vi.fn())
vi.mock('react-chartjs-2', () => ({
  Line: (props: { 'aria-label': string }) => {
    lineChart(props)
    return <div role="img" aria-label={props['aria-label']} />
  },
}))

function solve(index: number, penalty: Solve['penalty'] = 'none'): Solve {
  const timestamp = new Date(Date.UTC(2026, 0, index + 1)).toISOString()
  return {
    id: `solve-${index}`,
    duration_ms: 10_000 + index * 1_000,
    penalty,
    scramble: 'R U',
    recorded_at: timestamp,
    created_at: timestamp,
  }
}

function chartData() {
  const props = lineChart.mock.lastCall?.[0] as {
    data: ChartData<'line', (number | null)[], string>
    options: ChartOptions<'line'>
  }
  return props
}

afterEach(() => {
  cleanup()
  lineChart.mockClear()
})

describe('account progression', () => {
  it('omits DNF positions, but keeps them in the rolling averages', () => {
    const solves = [solve(0), solve(1), solve(2), solve(3, 'dnf'), solve(4), solve(5)]
    render(<AccountProgression solves={[...solves].reverse()} theme="catppuccin-mocha" />)

    const { data } = chartData()
    expect(data.labels).toEqual(['#1', '#2', '#3', '#5', '#6'])
    expect(data.datasets[0].data).toEqual([10_000, 11_000, 12_000, 14_000, 15_000])
    expect(data.datasets[2].data).toEqual([null, null, null, 12_333, 13_667])
    expect(data.datasets[1]).toMatchObject({ borderDash: [2, 5], stepped: 'before' })
    expect(data.datasets[2]).toMatchObject({ pointRadius: 0, spanGaps: false, tension: 0.5 })
    expect(data.datasets[0]).toMatchObject({ showLine: false, borderWidth: 0 })
    expect(data.datasets[4].borderColor).toBe('#cba6f7')
    expect(data.datasets[2].borderColor).not.toBe(data.datasets[4].borderColor)
    expect(chartData().options.scales?.y).toMatchObject({ position: 'right', title: { text: 'time' } })
    expect(screen.getByRole('img', { name: /5 completed solves/ })).toBeTruthy()
  })

  it('toggles PB and each average independently without hiding solve dots', () => {
    render(<AccountProgression solves={Array.from({ length: 50 }, (_, index) => solve(index))} theme="catppuccin-mocha" />)
    const controls = screen.getByRole('group', { name: 'Progression series' })
    const buttons = ['PB', 'AO5', 'AO12', 'AO50'].map((label) => within(controls).getByRole('button', { name: label }))

    expect(chartData().data.datasets[4].data.at(-1)).not.toBeNull()
    for (const button of buttons) {
      expect(button.getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(button)
      expect(button.getAttribute('aria-pressed')).toBe('false')
    }
    expect(chartData().data.datasets.map(({ hidden }) => hidden)).toEqual([undefined, true, true, true, true])
    expect(chartData().data.datasets[0].data).toHaveLength(50)
    expect(chartData().data.datasets[0].pointBackgroundColor).toBe('#cba6f7')

    fireEvent.click(buttons[2])
    expect(chartData().data.datasets.map(({ hidden }) => hidden)).toEqual([undefined, true, true, false, true])
  })

  it('shows an empty state when there are no completed solves', () => {
    render(<AccountProgression solves={[solve(0, 'dnf')]} theme="catppuccin-mocha" />)
    expect(screen.getByText('Your progression will appear after your first completed solve.')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(lineChart).not.toHaveBeenCalled()
  })
})
