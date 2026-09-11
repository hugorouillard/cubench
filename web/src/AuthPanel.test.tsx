/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthPanel } from './AuthPanel'

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
    const { container } = render(
      <AuthPanel
        onAuthenticated={authenticated}
        onClose={vi.fn()}
        onSubmittingChange={submittingChanged}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'create account' }))
    fireEvent.change(screen.getByLabelText('username'), {
      target: { value: 'speedcuber' },
    })
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: 'test-password' },
    })
    fireEvent.change(screen.getByLabelText('invite code'), {
      target: { value: 'shared-code' },
    })
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[type="submit"]')!)

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
    const { container } = render(
      <AuthPanel
        onAuthenticated={vi.fn()}
        onClose={vi.fn()}
        onSubmittingChange={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('username'), {
      target: { value: 'speedcuber' },
    })
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: 'incorrect' },
    })

    fireEvent.click(container.querySelector<HTMLButtonElement>('button[type="submit"]')!)

    expect((await screen.findByRole('alert')).textContent).toBe('Password is too short')
  })
})
