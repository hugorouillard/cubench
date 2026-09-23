import type { Solve, UserProfile } from './types'

export type ProfilePreview = {
  profile: UserProfile
  solves: Solve[]
}

const PRACTICE_DAYS = 168
const FACES = ['R', 'L', 'U', 'D', 'F', 'B']
const SUFFIXES = ['', "'", '2']

// A fixed seed makes the fictional history reproducible; only its dates move with today.
function randomGenerator() {
  let seed = 0x6c8e9cf5
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
}

function scramble(random: () => number): string {
  const moves: string[] = []
  let lastAxis = -1
  for (let move = 0; move < 20; move += 1) {
    // Avoid consecutive turns on the same axis (R/L, U/D, F/B).
    const axes = [0, 1, 2].filter((axis) => axis !== lastAxis)
    const axis = axes[Math.floor(random() * axes.length)]
    const face = FACES[axis * 2 + Math.floor(random() * 2)]
    moves.push(`${face}${SUFFIXES[Math.floor(random() * SUFFIXES.length)]}`)
    lastAxis = axis
  }
  return moves.join(' ')
}

// Synthetic practice history, kept entirely separate from guest and account solves.
// Relative dates keep every filter useful whenever someone opens the preview.
export function createProfilePreview(now = new Date()): ProfilePreview {
  const solves: Solve[] = []
  const random = randomGenerator()

  for (let day = PRACTICE_DAYS - 1; day >= 0; day -= 1) {
    if (day > 2 && (day % 7 === 3 || day % 7 === 5 || day % 23 === 11)) continue
    const progress = (PRACTICE_DAYS - 1 - day) / (PRACTICE_DAYS - 1)
    const attempts = 6 + Math.floor(progress * 4) + Math.floor(random() * 4)
    // The typical solve improves from ~38s to ~17s, with plateaus and off days.
    const typicalMs = 38_000 - 21_000 * progress ** 0.8 +
      Math.sin(day * 0.19) * 850 + Math.sin(day * 0.53) * 450
    const sessionStart = new Date(now)
    sessionStart.setDate(sessionStart.getDate() - day)
    if (day === 0) sessionStart.setTime(now.getTime() - attempts * 90_000)
    else sessionStart.setHours(18, 0, 0, 0)

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const index = solves.length
      const recordedAt = new Date(sessionStart.getTime() + attempt * 90_000)
      const timestamp = recordedAt.toISOString()
      const variation = (random() + random() - 1) * (5_000 - progress * 2_000)
      const slowSolve = random() < 0.07 ? 4_000 + random() * 5_000 : 0
      const penaltyRoll = random()
      solves.push({
        id: `preview-${index}`,
        duration_ms: Math.round(typicalMs + variation + slowSolve),
        penalty: penaltyRoll < 0.025 ? 'dnf' : penaltyRoll < 0.07 ? 'plus2' : 'none',
        scramble: scramble(random),
        recorded_at: timestamp,
        created_at: timestamp,
      })
    }
  }

  return {
    profile: {
      id: 0,
      display_name: 'Sample solver',
      bio: '',
      created_at: solves[0].recorded_at,
    },
    solves: solves.reverse(),
  }
}
