import {
  CategoryScale,
  Chart as ChartJS,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
  type Tick,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip)
ChartJS.defaults.font.family = getComputedStyle(document.documentElement).fontFamily

export function getChartColors() {
  const style = getComputedStyle(document.documentElement)
  const color = (variable: string, fallback: string) =>
    style.getPropertyValue(variable).trim() || fallback

  return {
    background: color('--bg-color', '#1e1e2e'),
    main: color('--main-color', '#cba6f7'),
    text: color('--text-color', '#cdd6f4'),
    muted: color('--sub-readable-color', '#7f849c'),
    surface: color('--sub-alt-color', '#181825'),
    error: color('--error-readable-color', '#eba0ac'),
    line: color('--line-color', '#313244'),
  }
}

type ChartColors = ReturnType<typeof getChartColors>

export function getLineChartOptions(): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    normalized: true,
    plugins: { legend: { display: false } },
  }
}

export function formatTimeAxisTick(value: number | string, _index: number, ticks: Tick[]): string {
  const valueMs = Number(value)
  const tickValues = ticks.map((tick) => tick.value)
  const allTicksOnStep = (stepMs: number) => tickValues.every((tickMs) =>
    Math.abs(tickMs - Math.round(tickMs / stepMs) * stepMs) < 0.001,
  )
  // Show only the precision needed to represent every tick on this axis.
  const decimals = allTicksOnStep(1_000) ? 0 : allTicksOnStep(100) ? 1 : 2

  const roundedSeconds = Math.round(Math.abs(valueMs) / (1_000 / 10 ** decimals)) / 10 ** decimals
  const minutes = Math.floor(roundedSeconds / 60)
  const seconds = roundedSeconds - minutes * 60
  const secondText = seconds.toFixed(decimals)
  const time = minutes > 0
    ? `${minutes}:${secondText.padStart(decimals ? decimals + 3 : 2, '0')}`
    : secondText
  return valueMs < 0 ? `-${time}` : time
}

export function getTooltipOptions(colors: ChartColors) {
  return {
    displayColors: false,
    backgroundColor: colors.surface,
    titleColor: colors.text,
    bodyColor: colors.muted,
    borderColor: colors.line,
    borderWidth: 1,
  }
}
