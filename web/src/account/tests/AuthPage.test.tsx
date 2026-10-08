/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthPage } from '../AuthPage'

describe('account access', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('registers with the shared invite code', async () => {
    const account = {
      id: 1,
      username: 'speedcuber',
      display_name: 'speedcuber',
      bio: '',
      created_at: '2026-01-01T00:00:00Z',
    }
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(account), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const authenticated = vi.fn()
    const submittingChanged = vi.fn()
    render(
      <AuthPage
        onAuthenticated={authenticated}
        onSubmittingChange={submittingChanged}
        onPreview={vi.fn()}
      />,
    )

    const register = within(screen.getByRole('region', { name: 'create account' }))
    fireEvent.change(register.getByLabelText('username'), {
      target: { value: 'speedcuber' },
    })
    fireEvent.change(register.getByLabelText('password'), {
      target: { value: 'test-password' },
    })
    fireEvent.change(register.getByLabelText('invite code'), {
      target: { value: 'shared-code' },
    })
    fireEvent.click(register.getByRole('button', { name: 'create account' }))

    await vi.waitFor(() => expect(authenticated).toHaveBeenCalledWith(account))
    expect(submittingChanged.mock.calls).toEqual([[true], [false]])
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'speedcuber',
          password: 'test-password',
          invite_code: 'shared-code',
        }),
      }),
    )
  })

  it('shows validation messages returned by the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ detail: [{ msg: 'Password is too short' }] }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    render(
      <AuthPage
        onAuthenticated={vi.fn()}
        onSubmittingChange={vi.fn()}
        onPreview={vi.fn()}
      />,
    )
    const signIn = within(screen.getByRole('region', { name: 'sign in' }))
    fireEvent.change(signIn.getByLabelText('username'), {
      target: { value: 'speedcuber' },
    })
    fireEvent.change(signIn.getByLabelText('password'), {
      target: { value: 'incorrect' },
    })

    fireEvent.click(signIn.getByRole('button', { name: 'sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Password is too short')
  })

  it('shares the invitation and preview below both forms', () => {
    const onPreview = vi.fn()
    const { container } = render(
      <AuthPage onAuthenticated={vi.fn()} onSubmittingChange={vi.fn()} onPreview={onPreview} />,
    )

    const invite = screen.getByRole('link', { name: 'request an invite' })
    expect(invite.getAttribute('href')).toContain('mailto:rouillard.hugo1@gmail.com')
    expect(container.querySelector('.auth-footer')?.lastElementChild?.contains(invite)).toBe(true)
    expect(screen.getByLabelText('invite code').getAttribute('aria-describedby')).toBe('invite-code-help')
    expect(screen.queryByText('request an invite from Hugo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'preview account features' }))
    expect(onPreview).toHaveBeenCalledOnce()
  })
})
