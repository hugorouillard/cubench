import type {
  ExportData,
  Penalty,
  PracticeSession,
  Solve,
  SolveInput,
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

export function createSession(name: string): Promise<PracticeSession> {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function getSolves(sessionId: string): Promise<Solve[]> {
  return request(`/api/solves?session_id=${encodeURIComponent(sessionId)}`)
}

export function createSolve(solve: SolveInput): Promise<Solve> {
  return request('/api/solves', {
    method: 'POST',
    body: JSON.stringify(solve),
  })
}

export function updateSolvePenalty(
  solveId: string,
  penalty: Penalty,
): Promise<Solve> {
  return request(`/api/solves/${solveId}`, {
    method: 'PATCH',
    body: JSON.stringify({ penalty }),
  })
}

export function deleteSolve(solveId: string): Promise<void> {
  return request(`/api/solves/${solveId}`, { method: 'DELETE' })
}

export function getExportData(): Promise<ExportData> {
  return request('/api/export')
}
