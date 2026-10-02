import { IHttpClient } from '../interfaces/IHttpClient'

export type Role = 'readonly' | 'readwrite' | 'admin'
export type AuthMode = 'none' | 'local' | 'ldap'

export interface AuthStatus {
  mode: AuthMode
  default_role: Role
  setup_required: boolean
  authenticated: boolean
  subject: string
  role: Role
  ldap_cluster: string | null
  /** Attribute users type as the username in ldap mode, e.g. "uid". */
  ldap_username_hint: string | null
  session_lifetime_hours: number
}

export interface Identity {
  subject: string
  role: Role
  authenticated: boolean
  method: string
}

export interface BuiltInUser {
  username: string
  role: Role
}

export class AuthService {
  constructor(private httpClient: IHttpClient) {}

  /** Public - tells the UI whether to show nothing, a login form, or the wizard. */
  async getStatus(): Promise<AuthStatus> {
    return this.httpClient.get<AuthStatus>('/api/auth/status')
  }

  async login(username: string, password: string): Promise<{ ok: boolean; identity: Identity }> {
    return this.httpClient.post('/api/auth/login', { username, password })
  }

  async logout(): Promise<{ ok: boolean }> {
    return this.httpClient.post('/api/auth/logout')
  }

  async me(): Promise<Identity> {
    return this.httpClient.get<Identity>('/api/auth/me')
  }

  /** First run only, mode=local. Creates the initial users and signs you in. */
  async setup(
    users: Array<{ username: string; password: string; role: Role }>
  ): Promise<{ ok: boolean; identity: Identity; users: BuiltInUser[] }> {
    return this.httpClient.post('/api/auth/setup', { users })
  }

  async listUsers(): Promise<{ mode: AuthMode; users: BuiltInUser[] }> {
    return this.httpClient.get('/api/auth/users')
  }

  async upsertUser(username: string, password: string, role: Role): Promise<{ ok: boolean; users: BuiltInUser[] }> {
    return this.httpClient.post('/api/auth/users', { username, password, role })
  }

  async deleteUser(username: string): Promise<{ ok: boolean; users: BuiltInUser[] }> {
    return this.httpClient.delete(`/api/auth/users/${encodeURIComponent(username)}`)
  }
}
