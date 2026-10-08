/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountNavigation } from '../AccountNavigation'
import { useAuth, type AuthContextValue } from '../../auth/useAuth'

vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }))

let auth: AuthContextValue

function renderNavigation(overrides = {}) {
  const props = {
    currentPage: 'timer' as const,
    navigationDisabled: false,
    accountActionDisabled: false,
    onNavigate: vi.fn(),
    onOpenChange: vi.fn(),
    beforeLogout: vi.fn(() => true),
    onError: vi.fn(),
    ...overrides,
  }
  return { ...render(<AccountNavigation {...props} />), ...props }
}

function openMenu() {
  fireEvent.pointerEnter(screen.getByRole('navigation', { name: 'Account' }), { pointerType: 'mouse' })
}

describe('account navigation', () => {
  beforeEach(() => {
    auth = {
      account: { id: 1, username: 'cuber', display_name: 'Cuber', bio: '', created_at: '2026-01-01' },
      checking: false,
      pending: null,
      sessionError: '',
      dismissSessionError: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      applyProfile: vi.fn(),
    }
    vi.mocked(useAuth).mockReturnValue(auth)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('offers sign in to guests', () => {
    auth.account = null
    const { onNavigate } = renderNavigation()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onNavigate).toHaveBeenCalledWith('login')
  })

  it('opens on hover, closes on leave, and navigates directly on desktop click', () => {
    const { onOpenChange, onNavigate } = renderNavigation()
    openMenu()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerLeave(screen.getByRole('navigation'), { pointerType: 'mouse' })
    expect(screen.queryByRole('group', { name: 'Account actions' })).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Cuber' }))
    expect(onNavigate).toHaveBeenCalledWith('profile')
  })

  it('supports keyboard focus, Escape dismissal, and reopening after focus leaves', () => {
    renderNavigation()
    const trigger = screen.getByRole('button', { name: 'Account menu for Cuber' })
    act(() => trigger.focus())
    const profile = screen.getByRole('button', { name: 'profile' })
    act(() => profile.focus())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(profile, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    act(() => trigger.blur())
    act(() => trigger.focus())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    act(() => trigger.blur())
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on an outside press and releases the open notification on unmount', () => {
    const { onOpenChange, unmount } = renderNavigation()
    openMenu()
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    fireEvent.pointerLeave(screen.getByRole('navigation'), { pointerType: 'mouse' })
    openMenu()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    unmount()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('toggles with touch without navigating, then follows the profile action', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const { onNavigate } = renderNavigation()
    const trigger = screen.getByRole('button', { name: 'Account menu for Cuber' })
    fireEvent.pointerDown(trigger, { pointerType: 'touch' })
    act(() => trigger.focus())
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'sign out' })).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('button', { name: 'sign out' })).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'profile' }))
    expect(onNavigate).toHaveBeenCalledWith('profile')
  })

  it('allows logout when practice policy blocks profile navigation', async () => {
    const { beforeLogout } = renderNavigation({ navigationDisabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Cuber' }))
    expect(screen.getByRole('button', { name: 'profile' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledOnce())
    expect(beforeLogout).toHaveBeenCalledOnce()
  })

  it('honors the shell’s logout veto without calling the API', () => {
    renderNavigation({ beforeLogout: () => false })
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
    expect(auth.logout).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'sign out' })).toBeNull()
  })

  it('reports logout failure without navigating', async () => {
    vi.mocked(auth.logout).mockRejectedValue(new Error('offline'))
    const { onError, onNavigate } = renderNavigation()
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Could not sign out: offline'))
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it.each(['checking', 'pending', 'practice'] as const)('does not open while blocked by %s', (reason) => {
    auth.checking = reason === 'checking'
    auth.pending = reason === 'pending' ? 'logout' : null
    renderNavigation({ accountActionDisabled: reason === 'practice' })
    const trigger = screen.getByRole('button', { name: 'Account menu for Cuber' })
    expect(trigger.hasAttribute('disabled')).toBe(true)
    openMenu()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})
