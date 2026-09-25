import type { ChartData, ChartOptions } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { getChartColors, getLineChartOptions, getTooltipOptions } from '../Charts'
import { solveHistory } from '../solves/stats'
import { formatTime } from '../timer/timer'
import type { Solve } from '../types'

type SessionChartProps = {
  solves: Solve[]
  theme: string
}

export function SessionChart({
  solves,
  theme: _theme,
}: SessionChartProps) {
  const history = solveHistory(solves)
  const solveById = new Map(solves.map((solve) => [solve.id, solve]))
  const colors = getChartColors()
  const baseOptions = getLineChartOptions()
  const compactPoints = history.length > 50
  const data: ChartData<'line', (number | null)[], string> = {
    labels: history.map((_, index) => `#${index + 1}`),
    datasets: [
      {
        label: 'single',
        data: history.map((point) => point.singleMs),
        borderColor: colors.main,
        backgroundColor: colors.main,
        borderWidth: 1.5,
        pointRadius: compactPoints ? 0 : 2.5,
        pointHoverRadius: 5,
        spanGaps: false,
      },
      {
        label: 'DNF',
        data: history.map((point) => {
          if (point.singleMs !== null) return null
          return solveById.get(point.solveId)?.duration_ms ?? null
        }),
        borderColor: colors.error,
        backgroundColor: colors.error,
        borderWidth: 0,
        pointRadius: compactPoints ? 3 : 4,
        pointHoverRadius: 6,
        pointStyle: 'crossRot',
        showLine: false,
      },
      {
        label: 'ao5',
        data: history.map((point) => point.ao5Ms),
        borderColor: colors.text,
        backgroundColor: colors.text,
        borderWidth: 1.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: false,
      },
    ],
  }
  const options: ChartOptions<'line'> = {
    ...baseOptions,
    interaction: { mode: 'nearest', intersect: true },
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...getTooltipOptions(colors),
        callbacks: {
          title: (items) => {
            const index = items[0]?.dataIndex
            return index === undefined ? '' : `solve #${index + 1}`
          },
          label: (context) => {
            const point = history[context.dataIndex]
            const solve = point ? solveById.get(point.solveId) : undefined
            if (!solve) return ''
            if (context.dataset.label === 'DNF') {
              return `DNF · raw ${formatTime(solve.duration_ms)}`
            }

            const value = context.parsed.y
            return value === null ? '' : `${context.dataset.label}: ${formatTime(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { display: false },
      },
      y: {
        grid: { color: colors.line },
        border: { display: false },
        ticks: {
          color: colors.muted,
          font: { size: 9 },
          maxTicksLimit: 3,
          callback: (value) => formatTime(Number(value)),
        },
      },
    },
  }

  return (
    <Line
      data={data}
      options={options}
      role="img"
      aria-label={`Chart of ${history.length} session solves with adjusted singles, DNF attempts, and ao5`}
    />
  )
}
