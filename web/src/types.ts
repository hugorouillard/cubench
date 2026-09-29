export type Penalty = 'none' | 'plus2' | 'dnf'

export type Solve = {
  id: string
  duration_ms: number
  penalty: Penalty
  scramble: string
  recorded_at: string
  created_at: string
}

export type SolveInput = Omit<Solve, 'created_at'>

export type SolveSummary = {
  revision: number
  solve_count: number
  completed_count: number
  total_duration_ms: number
  effective_duration_ms: number
  mean_ms: number | null
  best_single_ms: number | null
  best_single_at: string | null
  best_single_id: string | null
  best_ao5_ms: number | null
  best_ao5_at: string | null
  best_ao5_id: string | null
  best_ao12_ms: number | null
  best_ao12_at: string | null
  best_ao12_id: string | null
  best_ao50_ms: number | null
  best_ao50_at: string | null
  best_ao50_id: string | null
  first_completed_ms: number | null
  earliest_solve_at: string | null
  active_days: number
  current_streak: number
  longest_streak: number
}

export type ActivityDay = { day: string; attempts: number }

export type ProgressionPoint = {
  id: string
  recorded_at: string
  attempt_number: number
  single_ms: number
  pb_single_ms: number
  mean_5_ms: number | null
  mean_12_ms: number | null
  mean_50_ms: number | null
}

export type RecentPage = {
  revision: number
  solves: (Solve & { is_pb: boolean })[]
  next_cursor: string | null
}

export type AccountDashboard = {
  profile: UserProfile
  summary: SolveSummary
  activity: ActivityDay[]
  progression: ProgressionPoint[]
  recent: RecentPage
}

export type UserProfile = {
  id: number
  display_name: string
  bio: string
  created_at: string
}

export type Account = UserProfile & {
  username: string
}

export type RegistrationInput = {
  username: string
  password: string
  invite_code: string
}

export type LoginInput = Pick<RegistrationInput, 'username' | 'password'>

export type UserProfileInput = Pick<UserProfile, 'display_name' | 'bio'>

export type ExportData = {
  version: number
  exported_at: string
  profile: UserProfile
  solves: Solve[]
}
