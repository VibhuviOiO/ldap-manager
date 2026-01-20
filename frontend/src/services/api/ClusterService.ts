import { IHttpClient } from '../interfaces/IHttpClient'
import { Cluster, UserCreationForm, PasswordPolicy, TableColumns } from '../models'

interface ClusterHealthResponse {
  status: 'healthy' | 'warning' | 'error'
  message?: string
  timestamp: string
}

export class ClusterService {
  constructor(private httpClient: IHttpClient) {}

  async getClusters(): Promise<Cluster[]> {
    const response = await this.httpClient.get<{ clusters: Cluster[] }>('/api/clusters/list')
    return response.clusters
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
