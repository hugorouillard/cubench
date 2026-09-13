import { useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { login, register } from './api'
import type { Account } from './types'

type AuthPanelProps = {
  onAuthenticated: (account: Account) => void
  onClose: () => void
  onSubmittingChange: (submitting: boolean) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

export function AuthPanel({
  onAuthenticated,
  onClose,
  onSubmittingChange,
}: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    onSubmittingChange(true)
    try {
      const account = mode === 'login'
        ? await login({ username, password })
        : await register({ username, password, invite_code: inviteCode })
      onAuthenticated(account)
    } catch (authError) {
      setError(errorMessage(authError))
    } finally {
      setSubmitting(false)
      onSubmittingChange(false)
    }
  }

  function changeMode(nextMode: 'login' | 'register') {
    setMode(nextMode)
    setError('')
  }

  return (
    <div className="auth-panel">
      <div className="dialog-heading">
        <div>
          <span>account</span>
          <h2 id="auth-dialog-title">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={submitting} aria-label="Close">
          <FontAwesomeIcon className="app-icon" icon={faXmark} fixedWidth aria-hidden="true" />
        </button>
      </div>

      <div className="auth-mode" role="group" aria-label="Account action">
        <button
          className={mode === 'login' ? 'is-active' : ''}
          type="button"
          onClick={() => changeMode('login')}
          disabled={submitting}
          aria-pressed={mode === 'login'}
        >
          sign in
        </button>
        <button
          className={mode === 'register' ? 'is-active' : ''}
          type="button"
          onClick={() => changeMode('register')}
          disabled={submitting}
          aria-pressed={mode === 'register'}
        >
          create account
        </button>
      </div>

      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>username</span>
          <input
            data-autofocus
            required
            minLength={mode === 'register' ? 3 : 1}
            maxLength={32}
            pattern={mode === 'register' ? '[\\-A-Za-z0-9_]+' : undefined}
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          <span>password</span>
          <input
            required
            minLength={mode === 'register' ? 8 : 1}
            maxLength={128}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {mode === 'register' && (
          <label>
            <span>invite code</span>
            <input
              required
              maxLength={256}
              type="password"
              autoComplete="off"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
            />
          </label>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}
        <p className="auth-note">
          {mode === 'login'
            ? 'Signing in starts a fresh current session.'
            : 'Registration is invite-only. Ask for the shared invite code.'}
        </p>

        <div className="dialog-actions">
          <button className="button-primary" type="submit" disabled={submitting}>
            {submitting
              ? mode === 'login' ? 'signing in...' : 'creating account...'
              : mode === 'login' ? 'sign in' : 'create account'}
          </button>
        </div>
      </form>
    </div>
  )
}
