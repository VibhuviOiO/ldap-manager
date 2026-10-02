import { IHttpClient } from '../interfaces/IHttpClient'

export interface LdifImportError {
  dn: string
  changetype: string
  error: string
}

export interface LdifImportResult {
  status: string
  added: number
  modified: number
  deleted: number
  errors: LdifImportError[]
  dry_run?: boolean
  records?: number
  plan?: Array<{ dn: string; changetype: string }>
}

export class LdifService {
  constructor(private httpClient: IHttpClient) {}

  /** dry_run parses and plans without writing; it is the "Validate" action. */
  async import(clusterName: string, ldif: string, dryRun = false): Promise<LdifImportResult> {
    return this.httpClient.post('/api/ldif/import', {
      cluster_name: clusterName,
      ldif,
      dry_run: dryRun,
    })
  }
}
