import type {
  ExportData,
  PracticeSession,
  Solve,
  SolveInput,
  UserProfile,
  UserProfileInput,
} from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string
    } | null
    throw new Error(body?.detail ?? `Request failed (${response.status})`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function getSessions(): Promise<PracticeSession[]> {
  return request('/api/sessions')
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

export function getSolves(sessionId?: string): Promise<Solve[]> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''
  return request(`/api/solves${query}`)
}

export function createSolve(solve: SolveInput): Promise<Solve> {
  return request('/api/solves', {
    method: 'POST',
    body: JSON.stringify(solve),
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

export function clearSolves(): Promise<void> {
  return request('/api/solves', { method: 'DELETE' })
}

export function getExportData(): Promise<ExportData> {
  return request('/api/export')
}
