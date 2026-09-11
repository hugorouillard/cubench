import type { Solve, SolveInput } from './types'

export type SolveUpdate = Partial<Pick<Solve, 'duration_ms' | 'penalty'>>

export type SolveStore = {
  create: (solve: SolveInput) => Promise<Solve>
  update: (solve: Solve, update: SolveUpdate) => Promise<Solve>
  delete: (solve: Solve) => Promise<void>
}

export const guestSolveStore: SolveStore = {
  async create(solve) {
    return { ...solve, created_at: new Date().toISOString() }
  },
  async update(solve, update) {
    return { ...solve, ...update }
  },
  async delete() {},
}
