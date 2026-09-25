import type { DatedSolveRecord } from '../stats'
import { formatTime } from '../timer'
import { formatAccountDate } from './format'

type Best = { label: string; value: number | null; achievedAt?: string; context?: string }

export function PersonalBests({ single, ao5, ao12, ao50 }: {
  single: DatedSolveRecord | null
  ao5: DatedSolveRecord | null
  ao12: DatedSolveRecord | null
  ao50: number | null
}) {
  const bests: Best[] = [
    { label: 'single', value: single?.durationMs ?? null, achievedAt: single?.achievedAt },
    { label: 'ao5', value: ao5?.durationMs ?? null, achievedAt: ao5?.achievedAt },
    { label: 'ao12', value: ao12?.durationMs ?? null, achievedAt: ao12?.achievedAt },
    { label: 'ao50', value: ao50, context: '50 attempts' },
  ]

  return (
    <section className="account-bests" aria-labelledby="account-bests-title">
      <h2 id="account-bests-title" className="account-visually-hidden">Personal bests</h2>
      <div className="account-bests-grid">
        {bests.map(({ label, value, achievedAt, context }) => (
          <div className="account-best" key={label}>
            <span>{label}</span>
            <strong>{value === null ? '—' : formatTime(value)}</strong>
            {achievedAt ? <time dateTime={achievedAt}>{formatAccountDate(achievedAt)}</time> : (
              <small>{context ?? 'no result yet'}</small>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
