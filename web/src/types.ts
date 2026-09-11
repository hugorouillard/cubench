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

export type UserProfile = {
  id: number
  display_name: string
  bio: string
  created_at: string
}

export type UserProfileInput = Pick<UserProfile, 'display_name' | 'bio'>

export type ExportData = {
  version: number
  exported_at: string
  profile: UserProfile
  solves: Solve[]
}
