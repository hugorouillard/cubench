import { describe, expect, it } from 'vitest'
import { guestSolveStore } from './solveStore'
import type { SolveInput } from './types'

const solve: SolveInput = {
  id: 'solve-1',
  duration_ms: 12_340,
  penalty: 'none',
  scramble: "R U R'",
  recorded_at: '2026-01-01T00:00:00.000Z',
}

describe('guest solve store', () => {
  it('creates a solve without changing its timer data', async () => {
    const created = await guestSolveStore.create(solve)

    expect(created).toMatchObject(solve)
    expect(created.created_at).toBeTruthy()
  })

  it('updates and deletes solves in memory', async () => {
    const created = await guestSolveStore.create(solve)

    await expect(guestSolveStore.update(created, { penalty: 'plus2' })).resolves.toEqual({
      ...created,
      penalty: 'plus2',
    })
    await expect(guestSolveStore.delete(created)).resolves.toBeUndefined()
  })
})
