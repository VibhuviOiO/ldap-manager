import { AxiosHttpClient } from './http/AxiosHttpClient'
import { ClusterService } from './api/ClusterService'
import { EntryService } from './api/EntryService'
import { AuthService } from './api/AuthService'
import { LdifService } from './api/LdifService'
import { AuditService } from './api/AuditService'

const contextPath = import.meta.env.VITE_CONTEXT_PATH || ''
const httpClient = new AxiosHttpClient(contextPath)

export const clusterService = new ClusterService(httpClient)
export const entryService = new EntryService(httpClient)
export const authService = new AuthService(httpClient)
export const ldifService = new LdifService(httpClient)
export const auditService = new AuditService(httpClient)
