import { useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRightToBracket, faUserPlus } from '@fortawesome/free-solid-svg-icons'
import { INVITE_REQUEST_URL } from './project'
import { useAuth } from './useAuth'

type AuthPageProps = {
  onPreview: () => void
}

type AuthFormProps = {
  mode: 'login' | 'register'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function AuthForm({ mode }: AuthFormProps) {
  const { login, register, checking, pending } = useAuth()
  const busy = checking || pending !== null
  const submitting = pending === mode
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const isRegister = mode === 'register'
  const action = isRegister ? 'create account' : 'sign in'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    try {
      if (isRegister) await register({ username, password, invite_code: inviteCode })
      else await login({ username, password })
    } catch (authError) {
      setError(errorMessage(authError))
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
          <input
            required
            minLength={isRegister ? 3 : 1}
            maxLength={32}
            pattern={isRegister ? '[\\-A-Za-z0-9_]+' : undefined}
            autoComplete="username"
            aria-label="username"
            placeholder="username"
            disabled={busy}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          <input
            required
            minLength={isRegister ? 8 : 1}
            maxLength={128}
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            aria-label="password"
            placeholder="password"
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {isRegister && (
          <label>
            <input
              required
              maxLength={256}
              type="password"
              autoComplete="off"
              aria-describedby="invite-code-help"
              aria-label="invite code"
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

export function AuthPage({ onPreview }: AuthPageProps) {
  const { checking, pending } = useAuth()
  const busy = checking || pending !== null

  return (
    <main className="auth-page page-width">
      <div className="auth-columns">
        <AuthForm mode="register" />
        <AuthForm mode="login" />
      </div>
      <div className="auth-footer">
        <button type="button" onClick={onPreview} disabled={busy}>preview account features</button>
        <p id="invite-code-help">accounts are invite-only during the beta period (<a href={INVITE_REQUEST_URL}>request an invite</a>).</p>
      </div>
    </main>
  )
}
