import { useMemo, useState } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartLine, faCrown } from '@fortawesome/free-solid-svg-icons'
import { Line } from 'react-chartjs-2'
import { solveHistory } from '../solves/stats'
import { formatTime } from '../timer/timer'
import type { Solve } from '../types'
import { formatAccountDate } from './format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip)

const AVERAGE_SERIES = [
  { key: 'ao5', label: 'Avg of 5' },
  { key: 'ao12', label: 'Avg of 12' },
  { key: 'ao50', label: 'Avg of 50' },
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

function chartColors() {
  const style = getComputedStyle(document.documentElement)
  const color = (variable: string, fallback: string) =>
    style.getPropertyValue(variable).trim() || fallback

  return {
    background: color('--bg-color', '#1e1e2e'),
    main: color('--main-color', '#cba6f7'),
    text: color('--text-color', '#cdd6f4'),
    muted: color('--sub-readable-color', '#7f849c'),
    surface: color('--sub-alt-color', '#181825'),
  }
}

export function AccountProgression({ solves, theme }: { solves: Solve[]; theme: string }) {
  const [visible, setVisible] = useState<Record<Series, boolean>>({
    pb: true, ao5: true, ao12: true, ao50: true,
  })
  const history = useMemo(() => solveHistory(solves), [solves])
  // A DNF still affects WCA average windows, but has no position on this graph.
  const plotted = history.flatMap((point, index) =>
    point.singleMs === null ? [] : [{ point, solveNumber: index + 1 }],
  )
  const colors = useMemo(chartColors, [theme])
  const visibleAverages = AVERAGE_SERIES.filter(({ key }) => visible[key])
  const averageColors = Object.fromEntries(visibleAverages.map(({ key }, index) => [
    key,
    blendHex(colors.background, colors.main, [0.45, 0.7, 1][index + 3 - visibleAverages.length]),
  ])) as Record<(typeof AVERAGE_SERIES)[number]['key'], string>
  const singleColor = blendHex(colors.background, colors.main, [1, 0.55, 0.4, 0.25][visibleAverages.length])

  const data: ChartData<'line', (number | null)[], string> = {
    labels: plotted.map(({ solveNumber }) => `#${solveNumber}`),
    datasets: [
      {
        label: 'solve',
        data: plotted.map(({ point }) => point.singleMs),
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
        data: plotted.map(({ point }) => point.pbSingleMs),
        borderColor: blendHex(colors.background, colors.text, 0.4),
        borderDash: [2, 5],
        borderWidth: 2,
        fill: false,
        stepped: 'before',
        pointRadius: 0,
        pointHoverRadius: 0,
        spanGaps: false,
        hidden: !visible.pb,
        order: 3,
      },
      ...AVERAGE_SERIES.map(({ key, label }) => ({
        label,
        data: plotted.map(({ point }) => point[`${key}Ms`]),
        borderColor: averageColors[key] ?? colors.main,
        borderWidth: 2,
        fill: false,
        tension: 0.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        spanGaps: false,
        hidden: !visible[key],
        order: 2,
      })),
    ],
  }
  const options: ChartOptions<'line'> = {
    font: {family: getComputedStyle(document.documentElement).fontFamily},
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    normalized: true,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        backgroundColor: colors.surface,
        titleColor: colors.text,
        bodyColor: colors.muted,
        borderColor: colors.surface,
        borderWidth: 1,
        filter: (item) => item.datasetIndex === 0,
        callbacks: {
          title: () => '',
          label: (context) => {
            const result = plotted[context.dataIndex]
            if (!result || result.point.singleMs === null) return ''
            const date = new Date(result.point.recordedAt)
            return [
              `solve #${result.solveNumber}: ${formatTime(result.point.singleMs)}`,
              `${formatAccountDate(result.point.recordedAt)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
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
        title: { display: true, text: 'time', color: colors.muted },
        ticks: {
          font: {family: getComputedStyle(document.documentElement).fontFamily} ,
          color: colors.muted,
          callback: (value) => formatTime(Number(value)),
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
            aria-label={`Progression of ${plotted.length} completed solves: individual solve dots, dotted personal best, and rolling averages of 5, 12, and 50 attempts`}
          />
        </div>
      ) : (
        <p className="account-progression-empty">Your progression will appear after your first completed solve.</p>
      )}
      <div className="account-progression-footer">
        <span className="account-progression-caption">Time change per hour spent solving: </span>
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
