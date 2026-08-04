import type { Penalty } from './types'

export function effectiveDuration(durationMs: number, penalty: Penalty): number {
  return durationMs + (penalty === 'plus2' ? 2000 : 0)
}

export function formatTime(durationMs: number, penalty: Penalty = 'none'): string {
  if (penalty === 'dnf') return 'DNF'

  const totalCentiseconds = Math.floor(
    effectiveDuration(durationMs, penalty) / 10,
  )
  const minutes = Math.floor(totalCentiseconds / 6000)
  const seconds = Math.floor((totalCentiseconds % 6000) / 100)
  const centiseconds = totalCentiseconds % 100
  const secondText = minutes > 0 ? String(seconds).padStart(2, '0') : String(seconds)
  const time = `${secondText}.${String(centiseconds).padStart(2, '0')}`

  return minutes > 0 ? `${minutes}:${time}` : time
}
