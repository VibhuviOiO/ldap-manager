import { IHttpClient } from '../interfaces/IHttpClient'
import { Cluster, UserCreationForm, PasswordPolicy, TableColumns, SchemaResponse, AciResponse } from '../models'

interface ClusterHealthResponse {
  status: 'healthy' | 'warning' | 'error'
  message?: string
  timestamp: string
}

export interface DashboardCluster {
  name: string
  description: string
  host: string | null
  port: number | null
  nodes: number
  readonly: boolean
  tls_mode: string
  replicated: boolean
  status: 'ok' | 'password_required' | 'unreachable' | 'slow'
  total: number
  users: number
  groups: number
  ous: number
  other: number
  error?: string
}

export interface DashboardSummary {
  clusters: DashboardCluster[]
  totals: {
    clusters: number
    healthy: number
    needs_attention: number
    readonly: number
    replicated: number
    entries: number
    users: number
    groups: number
    ous: number
  }
  cached: boolean
}

export interface Capability {
  id: string
  title: string
  why: string
  status: 'ok' | 'missing' | 'unknown'
  enable_ldif: string | null
}

export interface CapabilitiesResponse {
  cluster: string
  capabilities: Capability[]
  missing: string[]
}

export class ClusterService {
  constructor(private httpClient: IHttpClient) {}

  async getClusters(): Promise<Cluster[]> {
    const response = await this.httpClient.get<{ clusters: Cluster[] }>('/api/clusters/list')
    return response.clusters
  }

  async getCluster(clusterName: string): Promise<Cluster> {
    return this.httpClient.get<Cluster>(`/api/clusters/get/${clusterName}`)
  }

  /** One call that describes every cluster, for the home page. */
  async getDashboardSummary(refresh = false): Promise<DashboardSummary> {
    return this.httpClient.get<DashboardSummary>(
      `/api/dashboard/summary${refresh ? '?refresh=true' : ''}`
    )
  }

  /** Which optional server features this cluster has, and how to enable the rest. */
  async getCapabilities(clusterName: string): Promise<CapabilitiesResponse> {
    return this.httpClient.get<CapabilitiesResponse>(
      `/api/capabilities/${encodeURIComponent(clusterName)}`
    )
  }

  /** Schema inventory (attribute types + object classes) from cn=config. */
  async getSchema(clusterName: string): Promise<SchemaResponse> {
    return this.httpClient.get<SchemaResponse>(`/api/schema/${encodeURIComponent(clusterName)}`)
  }

  /** Add an attribute type or object class to a schema (admin, cn=config). */
  async addSchemaDefinition(
    clusterName: string,
    payload: { schema_name: string; kind: string; definition: string }
  ): Promise<{ status: string; name: string }> {
    return this.httpClient.post(`/api/schema/${encodeURIComponent(clusterName)}/definitions`, payload)
  }

  /** olcAccess rules per cn=config database. */
  async getAcis(clusterName: string): Promise<AciResponse> {
    return this.httpClient.get<AciResponse>(`/api/aci/${encodeURIComponent(clusterName)}`)
  }

  /** Append or insert an olcAccess rule (admin only). */
  async addAciRule(
    clusterName: string,
    payload: { database_dn: string; rule: string; position?: number | null }
  ): Promise<{ status: string }> {
    return this.httpClient.post(`/api/aci/${encodeURIComponent(clusterName)}/access`, payload)
  }

  /** Remove the olcAccess rule at a given {N} index (admin only). */
  async removeAciRule(
    clusterName: string,
    params: { database_dn: string; index: number }
  ): Promise<{ status: string }> {
    return this.httpClient.delete(`/api/aci/${encodeURIComponent(clusterName)}/access`, params)
  }

  /** Remove an attribute type or object class by name (admin, cn=config). */
  async removeSchemaDefinition(
    clusterName: string,
    name: string,
    params: { schema_name: string; kind: string }
  ): Promise<{ status: string }> {
    return this.httpClient.delete(
      `/api/schema/${encodeURIComponent(clusterName)}/definitions/${encodeURIComponent(name)}`,
      params
    )
  }

  async getClusterHealth(clusterName: string): Promise<ClusterHealthResponse> {
    return this.httpClient.get<ClusterHealthResponse>(`/api/clusters/health/${clusterName}`)
  }

  async getClusterColumns(clusterName: string): Promise<TableColumns> {
    return this.httpClient.get<TableColumns>(`/api/clusters/columns/${clusterName}`)
  }

  async getClusterForm(clusterName: string): Promise<UserCreationForm> {
    return this.httpClient.get<UserCreationForm>(`/api/clusters/form/${clusterName}`)
  }

  async getPasswordPolicy(clusterName: string): Promise<PasswordPolicy> {
    return this.httpClient.get<PasswordPolicy>(`/api/clusters/password-policy/${clusterName}`)
  }
}
