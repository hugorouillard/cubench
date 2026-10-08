import type { Solve, UserProfile } from '../types'
import previewHistory from '../../../api/src/cubench_api/preview_history.json'

export type ProfilePreview = {
  profile: UserProfile
  solves: Solve[]
}

const PRACTICE_DAYS = 365
const history: { day: number, solves: [number, Solve['penalty'], string][] }[] = previewHistory as
  { day: number, solves: [number, Solve['penalty'], string][] }[]

// The fixture also seeds the development account. Relative dates keep every
// filter useful whenever someone opens the preview.
export function createProfilePreview(now = new Date()): ProfilePreview {
  const solves: Solve[] = []
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)

  for (const { day, solves: samples } of history) {
    const attempts = day === 0
      ? Math.min(samples.length, 1 + Math.floor((now.getTime() - midnight.getTime()) / 90_000))
      : samples.length
    const sessionStart = new Date(now)
    sessionStart.setDate(sessionStart.getDate() - day)
    if (day === 0) sessionStart.setTime(now.getTime() - (attempts - 1) * 90_000)
    else sessionStart.setHours(18, 0, 0, 0)

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const index = solves.length
      const recordedAt = new Date(sessionStart.getTime() + attempt * 90_000)
      const timestamp = recordedAt.toISOString()
      const [duration_ms, penalty, scramble] = samples[attempt]
      solves.push({
        id: `preview-${index}`,
        duration_ms,
        penalty,
        scramble,
        recorded_at: timestamp,
        created_at: timestamp,
      })
    }
  }

  const accountStart = new Date(now)
  accountStart.setDate(accountStart.getDate() - PRACTICE_DAYS - 7)

  return {
    profile: {
      id: 0,
      display_name: 'Speedcuber',
      bio: '',
      created_at: accountStart.toISOString(),
    },
    solves: solves.reverse(),
  }
}
