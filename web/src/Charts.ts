import {
  CategoryScale,
  Chart as ChartJS,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip)

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
    font: { family: getComputedStyle(document.documentElement).fontFamily },
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    normalized: true,
    plugins: { legend: { display: false } },
  }
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
