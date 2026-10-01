import { useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRightToBracket, faUserPlus } from '@fortawesome/free-solid-svg-icons'
import { login, register } from '../api'
import { INVITE_REQUEST_URL } from './project'
import type { Account } from '../types'

type AuthPageProps = {
  onAuthenticated: (account: Account) => void
  onSubmittingChange: (submitting: boolean) => void
  onPreview: () => void
}

type AuthFormProps = {
  mode: 'login' | 'register'
  busy: boolean
  onAuthenticated: (account: Account) => void
  onSubmittingChange: (submitting: boolean) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function AuthForm({ mode, busy, onAuthenticated, onSubmittingChange }: AuthFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'
  const action = isRegister ? 'create account' : 'sign in'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setSubmitting(true)
    onSubmittingChange(true)
    try {
      const account = isRegister
        ? await register({ username, password, invite_code: inviteCode })
        : await login({ username, password })
      onAuthenticated(account)
    } catch (authError) {
      setError(errorMessage(authError))
    } finally {
      setSubmitting(false)
      onSubmittingChange(false)
    }
  }

  return (
    <section className="auth-column" aria-labelledby={`auth-${mode}-title`}>
      <h2 id={`auth-${mode}-title`}>
        <FontAwesomeIcon className="app-icon" icon={isRegister ? faUserPlus : faArrowRightToBracket} fixedWidth aria-hidden="true" />
        {action}
      </h2>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span className="sr-only">username</span>
          <input
            required
            minLength={isRegister ? 3 : 1}
            maxLength={32}
            pattern={isRegister ? '[\\-A-Za-z0-9_]+' : undefined}
            autoComplete="username"
            placeholder="username"
            disabled={busy}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">password</span>
          <input
            required
            minLength={isRegister ? 8 : 1}
            maxLength={128}
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            placeholder="password"
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {isRegister && (
          <label>
            <span className="sr-only">invite code</span>
            <input
              required
              maxLength={256}
              type="password"
              autoComplete="off"
              aria-describedby="invite-code-help"
              placeholder="invite code"
              disabled={busy}
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
            />
          </label>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {submitting ? isRegister ? 'creating account...' : 'signing in...' : action}
        </button>
      </form>
    </section>
  )
}

export function AuthPage({ onAuthenticated, onSubmittingChange, onPreview }: AuthPageProps) {
  const [submitting, setSubmitting] = useState(false)

  function handleSubmittingChange(next: boolean) {
    setSubmitting(next)
    onSubmittingChange(next)
  }

  return (
    <main className="auth-page page-width">
      <h1 className="sr-only">Account access</h1>
      <div className="auth-columns">
        <AuthForm mode="register" busy={submitting} onAuthenticated={onAuthenticated} onSubmittingChange={handleSubmittingChange} />
        <AuthForm mode="login" busy={submitting} onAuthenticated={onAuthenticated} onSubmittingChange={handleSubmittingChange} />
      </div>
      <div className="auth-footer">
        <button type="button" onClick={onPreview} disabled={submitting}>preview account features</button>
        <p id="invite-code-help">Accounts are invite-only for now. <a href={INVITE_REQUEST_URL}>Request an invite</a>.</p>
      </div>
    </main>
  )
}
