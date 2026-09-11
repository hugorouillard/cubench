import type {
  Account,
  ExportData,
  LoginInput,
  RegistrationInput,
  Solve,
  SolveInput,
  UserProfile,
  UserProfileInput,
} from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown
    } | null
    const messages = Array.isArray(body?.detail)
      ? body.detail.flatMap((item) => {
          if (typeof item !== 'object' || item === null || !('msg' in item)) return []
          return typeof item.msg === 'string' ? [item.msg] : []
        })
      : []
    const message = typeof body?.detail === 'string'
      ? body.detail
      : messages.join('; ') || `Request failed (${response.status})`
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function getAuthSession(): Promise<Account> {
  return request('/api/auth/session')
}

export function register(input: RegistrationInput): Promise<Account> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function login(input: LoginInput): Promise<Account> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' })
}

export function getProfile(): Promise<UserProfile> {
  return request('/api/profile')
}

export function updateProfile(profile: UserProfileInput): Promise<UserProfile> {
  return request('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  })
}

export function getSolves(): Promise<Solve[]> {
  return request('/api/solves')
}

export function createSolve(solve: SolveInput): Promise<Solve> {
  return request('/api/solves', {
    method: 'POST',
    body: JSON.stringify(solve),
    signal: AbortSignal.timeout(10_000),
  })
}

export function updateSolve(
  solveId: string,
  update: Partial<Pick<Solve, 'duration_ms' | 'penalty'>>,
): Promise<Solve> {
  return request(`/api/solves/${solveId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

export function deleteSolve(solveId: string): Promise<void> {
  return request(`/api/solves/${solveId}`, { method: 'DELETE' })
}

export function getExportData(): Promise<ExportData> {
  return request('/api/export')
}
