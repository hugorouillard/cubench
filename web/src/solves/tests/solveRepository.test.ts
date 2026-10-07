import { describe, expect, it, vi } from 'vitest'
import type { Solve } from '../../types'
import { createSolveRepository } from '../solveRepository'
import { guestSolveStore } from '../solveStore'

function solve(id: string): Solve {
  return { id, duration_ms: 10_000, penalty: 'none', scramble: 'R U', recorded_at: '2026-08-21T12:00:00Z', created_at: '2026-08-21T12:00:00Z' }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('solve repository', () => {
  it('loads lifetime history without changing session membership', async () => {
    const repository = createSolveRepository(guestSolveStore, async () => [solve('old')])
    await repository.loadHistory()
    expect(repository.getSnapshot().session).toEqual([])
    expect(repository.getSnapshot().history.map(({ id }) => id)).toEqual(['old'])
    await repository.update(solve('old'), { penalty: 'dnf' })
    expect(repository.getSnapshot().session).toEqual([])
    expect(repository.getSnapshot().history[0].penalty).toBe('dnf')
  })

  it('applies successful creates, edits and deletes to both projections', async () => {
    const repository = createSolveRepository(guestSolveStore, async () => [])
    const created = await repository.create(solve('new'))
    await repository.create(solve('new')) // idempotent save retries must not duplicate attempts
    expect(repository.getSnapshot().session).toHaveLength(1)
    expect(repository.getSnapshot().history).toHaveLength(1)
    await repository.update(created, { penalty: 'plus2' })
    expect(repository.getSnapshot().session[0].penalty).toBe('plus2')
    expect(repository.getSnapshot().history[0].penalty).toBe('plus2')
    await repository.delete(created)
    expect(repository.getSnapshot()).toEqual({ session: [], history: [] })
  })

  it('clears the session without deleting saved lifetime activity', async () => {
    const persistence = { ...guestSolveStore, delete: vi.fn() }
    const repository = createSolveRepository(persistence)
    const created = await repository.create(solve('new'))
    repository.clearSession()
    expect(repository.getSnapshot().session).toEqual([])
    expect(repository.getSnapshot().history).toEqual([created])
    expect(persistence.delete).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent loads, then refreshes on subsequent page entries', async () => {
    const request = deferred<Solve[]>()
    const load = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce([solve('other')])
    const repository = createSolveRepository(guestSolveStore, load)
    const first = repository.loadHistory()
    expect(repository.loadHistory()).toBe(first)
    request.resolve([solve('old')])
    await first
    expect(load).toHaveBeenCalledTimes(1)
    await repository.loadHistory()
    expect(load).toHaveBeenCalledTimes(2)
    expect(repository.getSnapshot().history.map(({ id }) => id)).toEqual(['other'])
  })

  it('reconciles mutations completed during a load instead of applying a stale response', async () => {
    const request = deferred<Solve[]>()
    const repository = createSolveRepository(guestSolveStore, () => request.promise)
    const loading = repository.loadHistory()
    const created = await repository.create(solve('new'))
    const updated = await repository.update(solve('edited'), { penalty: 'dnf' })
    await repository.delete(solve('deleted'))
    request.resolve([solve('edited'), solve('deleted')])
    await loading
    expect(repository.getSnapshot().history).toEqual([created, updated])
    expect(repository.getSnapshot().session).toEqual([created])
  })

  it('keeps snapshots unchanged on failed mutations and allows retry after load failures', async () => {
    const failure = new Error('offline')
    const load = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce([solve('old')])
    const persistence = {
      create: vi.fn().mockRejectedValue(failure),
      update: vi.fn().mockRejectedValue(failure),
      delete: vi.fn().mockRejectedValue(failure),
    }
    const repository = createSolveRepository(persistence, load)
    const initial = repository.getSnapshot()
    await expect(repository.create(solve('a'))).rejects.toThrow('offline')
    await expect(repository.update(solve('a'), { penalty: 'dnf' })).rejects.toThrow('offline')
    await expect(repository.delete(solve('a'))).rejects.toThrow('offline')
    await expect(repository.loadHistory()).rejects.toThrow('offline')
    expect(repository.getSnapshot()).toBe(initial)
    await repository.loadHistory()
    expect(repository.getSnapshot().history).toHaveLength(1)
  })

  it('notifies subscribers with stable snapshots and supports unsubscribing', async () => {
    const repository = createSolveRepository(guestSolveStore)
    const subscriber = vi.fn()
    const unsubscribe = repository.subscribe(subscriber)
    expect(repository.getSnapshot()).toBe(repository.getSnapshot())
    await repository.create(solve('new'))
    expect(subscriber).toHaveBeenCalledTimes(1)
    unsubscribe()
    repository.clearSession()
    expect(subscriber).toHaveBeenCalledTimes(1)
  })

  it('keeps late responses and cached data isolated between identities sharing an API adapter', async () => {
    const request = deferred<Solve[]>()
    const first = createSolveRepository(guestSolveStore, () => request.promise)
    const second = createSolveRepository(guestSolveStore, async () => [solve('second')])
    const loadingFirst = first.loadHistory()
    await second.loadHistory()
    request.resolve([solve('first')])
    await loadingFirst
    expect(second.getSnapshot().history.map(({ id }) => id)).toEqual(['second'])
    expect(second.getSnapshot().session).toEqual([])
  })
})
