import { useMemo, useState } from 'react'
import type { ChartData, ChartOptions } from 'chart.js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartLine, faCrown } from '@fortawesome/free-solid-svg-icons'
import { Line } from 'react-chartjs-2'
import { formatTimeAxisTick, getChartColors, getLineChartOptions, getTooltipOptions } from '../Charts'
import { solveHistory } from '../solves/stats'
import { formatTime } from '../timer/timer'
import type { ProgressionPoint, Solve } from '../types'
import { formatAccountDate } from './format'

const AVERAGE_SERIES = [
  { key: 'ao5', label: 'Mean of 5', size: 5 },
  { key: 'ao12', label: 'Mean of 12', size: 12 },
  { key: 'ao50', label: 'Mean of 50', size: 50 },
] as const
type Series = 'pb' | (typeof AVERAGE_SERIES)[number]['key']
const SERIES: { key: Series; label: string }[] = [{ key: 'pb', label: 'PB' }, ...AVERAGE_SERIES]

function blendHex(background: string, foreground: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const start = parseInt(background.slice(offset, offset + 2), 16)
    const end = parseInt(foreground.slice(offset, offset + 2), 16)
    return Math.round(start * (1 - amount) + end * amount).toString(16).padStart(2, '0')
  })
  return `#${channels.join('')}`
}

export function AccountProgression({ solves, points, completedCount, firstCompletedMs, totalDurationMs, theme }: {
  solves?: Solve[]
  points?: ProgressionPoint[]
  completedCount?: number
  firstCompletedMs?: number | null
  totalDurationMs?: number
  theme: string
}) {
  const [visible, setVisible] = useState<Record<Series, boolean>>({
    pb: true, ao5: true, ao12: true, ao50: true,
  })
  const history = useMemo(() => solves ? solveHistory(solves) : [], [solves])
  // Rolling means use completed solves; the separate PB cards use WCA averages.
  const plotted = points ?? history.flatMap((point, index) => point.singleMs === null ? [] : [{
    id: point.solveId, recorded_at: point.recordedAt,
    attempt_number: index + 1, single_ms: point.singleMs,
    pb_single_ms: point.pbSingleMs!, mean_5_ms: null,
    mean_12_ms: null, mean_50_ms: null,
  }])
  const rollingMean = (size: number) => plotted.map((point, index) => {
    if (points) return point[`mean_${size}_ms` as 'mean_5_ms' | 'mean_12_ms' | 'mean_50_ms']
    return index < size - 1 ? null : Math.round(
      plotted.slice(index - size + 1, index + 1).reduce((sum, item) => sum + item.single_ms, 0) / size,
    )
  })
  const firstPb = firstCompletedMs ?? plotted[0]?.pb_single_ms
  const currentPb = plotted.at(-1)?.pb_single_ms
  const timeSolving = totalDurationMs ?? (solves ?? []).reduce((sum, solve) => sum + solve.duration_ms, 0)
  const improvementPerHour = firstPb != null && currentPb != null && timeSolving > 0 ? (((firstPb - currentPb) / 1000)) / (timeSolving / 3_600_000): null
  const colors = useMemo(getChartColors, [theme])
  const baseOptions = getLineChartOptions()
  const visibleAverages = AVERAGE_SERIES.filter(({ key }) => visible[key])
  const averageColors = Object.fromEntries(visibleAverages.map(({ key }, index) => [
    key,
    blendHex(colors.background, colors.main, [0.45, 0.7, 1][index + 3 - visibleAverages.length]),
  ])) as Record<(typeof AVERAGE_SERIES)[number]['key'], string>
  const singleColor = blendHex(colors.background, colors.main, [1, 0.55, 0.4, 0.25][visibleAverages.length])

  const data: ChartData<'line', (number | null)[], string> = {
    labels: plotted.map(({ attempt_number }) => `#${attempt_number}`),
    datasets: [
      {
        label: 'solve',
        data: plotted.map(({ single_ms }) => single_ms),
        borderColor: singleColor,
        pointBackgroundColor: singleColor,
        borderWidth: 0,
        showLine: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointHitRadius: 7,
        order: 1,
      },
      {
        label: 'PB',
        data: plotted.map(({ pb_single_ms }) => pb_single_ms),
        borderColor: blendHex(colors.background, colors.text, 0.2),
        borderWidth: 3,
        fill: false,
        stepped: 'before',
        pointRadius: 0,
        pointHoverRadius: 0,
        spanGaps: true,
        hidden: !visible.pb,
        order: 3,
      },
      ...AVERAGE_SERIES.map(({ key, label, size }) => ({
        label,
        data: rollingMean(size),
        borderColor: averageColors[key] ?? colors.main,
        borderWidth: 3,
        fill: false,
        tension: 0.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        spanGaps: true,
        hidden: !visible[key],
        order: 2,
      })),
    ],
  }
  const options: ChartOptions<'line'> = {
    ...baseOptions,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...getTooltipOptions(colors),
        borderColor: colors.surface,
        filter: (item) => item.datasetIndex === 0,
        callbacks: {
          title: () => '',
          label: (context) => {
            const result = plotted[context.dataIndex]
            if (!result) return ''
            const date = new Date(result.recorded_at)
            return [
              `solve #${result.attempt_number}: ${formatTime(result.single_ms)}`,
              `${formatAccountDate(result.recorded_at)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        display: false,
        offset: true,
      },
      y: {
        position: 'right',
        beginAtZero: false,
        grid: { color: colors.surface, tickColor: colors.surface },
        border: { color: colors.surface },
        title: {
          display: true, text: 'Time',
          color: colors.muted,
        },
        ticks: {
          color: colors.muted,
          callback: formatTimeAxisTick,
        },
      },
    },
  }

  return (
    <section className="account-progression" aria-labelledby="account-progression-title">
      <header className="account-progression-header">
        <h2 id="account-progression-title">progression</h2>
      </header>
      {plotted.length ? (
        <div className="account-progression-chart">
          <Line
            data={data}
            options={options}
            role="img"
            aria-label={`Progression of ${completedCount ?? plotted.length} completed solves: individual solve dots, personal best, and rolling means of 5, 12, and 50 completed solves`}
          />
        </div>
      ) : (
        <p className="account-progression-empty">Your progression will appear after your first completed solve.</p>
      )}
      <div className="account-progression-footer">
        <span className="account-progression-caption">PB improvement per hour spent solving: {improvementPerHour === null ? '—' : `-${improvementPerHour.toFixed(2)}s`}</span>
        <div className="account-progression-controls" role="group" aria-label="Progression series">
          {SERIES.map(({ key, label }) => (
            <button
              key={key}
              className="account-progression-toggle"
              type="button"
              aria-pressed={visible[key]}
              onClick={() => setVisible((current) => ({ ...current, [key]: !current[key] }))}
            >
              <FontAwesomeIcon icon={key === 'pb' ? faCrown : faChartLine} fixedWidth aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
