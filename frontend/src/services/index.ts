import { AxiosHttpClient } from './http/AxiosHttpClient'
import { ClusterService } from './api/ClusterService'
import { EntryService } from './api/EntryService'
import { PasswordService } from './api/PasswordService'
import { ConnectionService } from './api/ConnectionService'

const contextPath = import.meta.env.VITE_CONTEXT_PATH || ''
const httpClient = new AxiosHttpClient(contextPath)

export const clusterService = new ClusterService(httpClient)
export const entryService = new EntryService(httpClient)
export const passwordService = new PasswordService(httpClient)
export const connectionService = new ConnectionService(httpClient)
