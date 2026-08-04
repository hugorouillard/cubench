export type Penalty = 'none' | 'plus2' | 'dnf'

export type PracticeSession = {
  id: string
  name: string
  created_at: string
}

export type Solve = {
  id: string
  session_id: string
  duration_ms: number
  penalty: Penalty
  scramble: string
  recorded_at: string
  created_at: string
}

export type SolveInput = Omit<Solve, 'created_at'>

export type ExportData = {
  version: number
  exported_at: string
  sessions: PracticeSession[]
  solves: Solve[]
}
