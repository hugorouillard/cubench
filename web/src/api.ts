import type {
  ExportData,
  Solve,
  SolveInput,
  UserProfile,
  UserProfileInput,
} from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
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
