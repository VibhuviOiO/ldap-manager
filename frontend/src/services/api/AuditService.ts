import { IHttpClient } from '../interfaces/IHttpClient'

export interface AuditEntry {
  ts: string
  actor: string
  role: string
  authenticated: boolean
  action: string
  cluster: string | null
  target: string | null
  result: string
  detail: Record<string, unknown>
}

export interface AuditResponse {
  entries: AuditEntry[]
  summary: { total: number; by_action: Record<string, number>; by_actor: Record<string, number>; failures: number }
}

export class AuditService {
  constructor(private httpClient: IHttpClient) {}

  async getAudit(params: {
    limit?: number
    actor?: string
    action?: string
    cluster?: string
    result?: string
  } = {}): Promise<AuditResponse> {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '' && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')
    return this.httpClient.get<AuditResponse>(`/api/audit${query ? `?${query}` : ''}`)
  }
}
