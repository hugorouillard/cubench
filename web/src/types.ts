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
