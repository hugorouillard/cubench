import type { Penalty } from './types'

export function effectiveDuration(durationMs: number, penalty: Penalty): number {
  return durationMs + (penalty === 'plus2' ? 2000 : 0)
}

export function togglePenalty(current: Penalty, selected: Penalty): Penalty {
  return current === selected ? 'none' : selected
}

export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs > 17_000) return 'dnf'
  if (elapsedMs > 15_000) return 'plus2'
  return 'none'
}

export function formatInspectionTime(elapsedMs: number): string {
  const penalty = inspectionPenalty(elapsedMs)
  if (penalty === 'dnf') return 'DNF'
  if (penalty === 'plus2') return '+2'
  return String(Math.ceil(Math.max(0, 15_000 - elapsedMs) / 1000))
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
