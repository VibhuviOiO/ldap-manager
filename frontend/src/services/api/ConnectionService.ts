import { IHttpClient } from '../interfaces/IHttpClient'

export class ConnectionService {
  constructor(private httpClient: IHttpClient) {}

  async connect(clusterName: string, password: string): Promise<void> {
    await this.httpClient.post('/api/connection/connect', {
      cluster_name: clusterName,
      bind_password: password
    })
  }
}
