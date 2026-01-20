import { IHttpClient } from '../interfaces/IHttpClient'

export class PasswordService {
  constructor(private httpClient: IHttpClient) {}

  async checkPasswordCache(clusterName: string): Promise<{ cached: boolean }> {
    return this.httpClient.get(`/api/password/check/${clusterName}`)
  }

  async changePassword(clusterName: string, dn: string, newPassword: string): Promise<void> {
    await this.httpClient.post('/api/password/change', {
      cluster_name: clusterName,
      dn,
      new_password: newPassword
    })
  }
}
