/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api'
import { AuthProvider } from '../AuthProvider'
import { useAuth } from '../useAuth'
import type { Account } from '../../types'

vi.mock('../../api', async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  getAuthSession: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))

const account: Account = {
  id: 1,
  username: 'speedcuber',
  display_name: 'Speed Cuber',
  bio: '',
  created_at: '2026-01-01T00:00:00Z',
}
const credentials = { username: 'speedcuber', password: 'test-password' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function renderAuth() {
  const hook = renderHook(() => useAuth(), { wrapper: AuthProvider })
  await waitFor(() => expect(hook.result.current.checking).toBe(false))
  return hook
}

describe('authentication ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.getAuthSession).mockRejectedValue(new api.ApiError('Not authenticated', 401))
    vi.mocked(api.login).mockResolvedValue(account)
    vi.mocked(api.register).mockResolvedValue(account)
    vi.mocked(api.logout).mockResolvedValue(undefined)
  })

  afterEach(cleanup)

  it('restores the session before allowing authentication commands', async () => {
    const session = deferred<Account>()
    vi.mocked(api.getAuthSession).mockReturnValue(session.promise)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    expect(result.current.checking).toBe(true)
    await expect(result.current.login(credentials)).rejects.toThrow('already in progress')
    expect(api.login).not.toHaveBeenCalled()
    await act(async () => session.resolve(account))
    expect(result.current.account).toEqual(account)
    expect(result.current.checking).toBe(false)
    expect(result.current.pending).toBeNull()
  })

  it('treats an absent session as a guest, not an error', async () => {
    const { result } = await renderAuth()
    expect(result.current.account).toBeNull()
    expect(result.current.sessionError).toBe('')
  })

  it('exposes dismissible restoration failures while allowing guest use', async () => {
    vi.mocked(api.getAuthSession).mockRejectedValue(new Error('offline'))
    const { result } = await renderAuth()
    expect(result.current.account).toBeNull()
    expect(result.current.sessionError).toBe('Could not restore account; continuing as guest: offline')
    act(() => result.current.dismissSessionError())
    expect(result.current.sessionError).toBe('')
  })

  it.each(['login', 'register'] as const)('owns the %s lifecycle and commits the account on success', async (operation) => {
    const request = deferred<Account>()
    vi.mocked(api[operation]).mockReturnValue(request.promise)
    const { result } = await renderAuth()
    let completion!: Promise<void>
    act(() => {
      completion = result.current[operation]({ ...credentials, invite_code: 'invite' })
    })
    expect(result.current.pending).toBe(operation)
    expect(result.current.account).toBeNull()
    await act(async () => {
      request.resolve(account)
      await completion
    })
    expect(result.current.pending).toBeNull()
    expect(result.current.account).toEqual(account)
  })

  it('propagates submission errors and releases pending state for retry', async () => {
    const { result } = await renderAuth()
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials'))
    await act(async () => {
      await expect(result.current.login(credentials)).rejects.toThrow('Invalid credentials')
    })
    expect(result.current.pending).toBeNull()
    expect(result.current.account).toBeNull()
    expect(result.current.sessionError).toBe('')

    await act(async () => result.current.login(credentials))
    expect(result.current.account).toEqual(account)
  })

  it('rejects overlapping commands even in the same render', async () => {
    const request = deferred<Account>()
    vi.mocked(api.login).mockReturnValue(request.promise)
    const { result } = await renderAuth()
    let completion!: Promise<void>
    await act(async () => {
      completion = result.current.login(credentials)
      await expect(result.current.register({ ...credentials, invite_code: 'invite' }))
        .rejects.toThrow('already in progress')
    })
    expect(api.register).not.toHaveBeenCalled()
    expect(result.current.pending).toBe('login')
    await act(async () => {
      request.resolve(account)
      await completion
    })
  })

  it('retains the account after failed logout and clears it only after success', async () => {
    vi.mocked(api.getAuthSession).mockResolvedValue(account)
    const { result } = await renderAuth()
    vi.mocked(api.logout).mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      await expect(result.current.logout()).rejects.toThrow('offline')
    })
    expect(result.current.account).toEqual(account)
    expect(result.current.pending).toBeNull()

    const request = deferred<void>()
    vi.mocked(api.logout).mockReturnValue(request.promise)
    let completion!: Promise<void>
    act(() => { completion = result.current.logout() })
    expect(result.current.pending).toBe('logout')
    expect(result.current.account).toEqual(account)
    await act(async () => {
      request.resolve(undefined)
      await completion
    })
    expect(result.current.account).toBeNull()
    expect(result.current.pending).toBeNull()
  })

  it('applies profile edits without replacing identity or accepting another account’s profile', async () => {
    vi.mocked(api.getAuthSession).mockResolvedValue(account)
    const { result } = await renderAuth()
    act(() => result.current.applyProfile({ ...account, display_name: 'Updated Cuber' }))
    expect(result.current.account).toEqual({ ...account, display_name: 'Updated Cuber' })
    act(() => result.current.applyProfile({ ...account, id: 2 }))
    expect(result.current.account?.display_name).toBe('Updated Cuber')
  })
})
