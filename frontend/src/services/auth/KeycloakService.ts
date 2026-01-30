/**
 * Keycloak authentication service.
 *
 * Wraps keycloak-js SDK with application-specific configuration.
 * Handles OAuth2/OIDC flow with PKCE for secure browser-based authentication.
 */

import Keycloak from 'keycloak-js'

export interface AuthConfig {
  url: string
  realm: string
  clientId: string
}

export interface AuthUser {
  id: string
  username: string
  email?: string
  roles: string[]
}

export class KeycloakService {
  private keycloak: Keycloak | null = null
  private config: AuthConfig
  private initPromise: Promise<boolean> | null = null

  constructor(config: AuthConfig) {
    this.config = config
  }

  /**
   * Initialize Keycloak and check authentication status.
   *
   * @returns Promise<boolean> - true if user is authenticated
   */
  async init(): Promise<boolean> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._init()
    return this.initPromise
  }

  private async _init(): Promise<boolean> {
    this.keycloak = new Keycloak({
      url: this.config.url,
      realm: this.config.realm,
      clientId: this.config.clientId
    })

    try {
      const authenticated = await this.keycloak.init({
        onLoad: 'login-required',  // Force login if not authenticated
        checkLoginIframe: false,    // Disable iframe (PKCE is more secure)
        pkceMethod: 'S256',         // Enable PKCE with SHA-256
        flow: 'standard'            // Authorization Code flow
      })

      if (authenticated) {
        console.log('✅ Keycloak authenticated')
        console.log('Token expires in:', this.keycloak.tokenParsed?.exp ?
          Math.floor((this.keycloak.tokenParsed.exp * 1000 - Date.now()) / 1000) + 's' :
          'unknown')

        // Setup automatic token refresh (5 min before expiry)
        this.keycloak.onTokenExpired = () => {
          console.log('🔄 Token expired, refreshing...')
          this.refreshToken()
        }

        // Setup proactive token refresh (refresh when less than 5 min remaining)
        const minValiditySeconds = 300 // 5 minutes
        setInterval(() => {
          this.keycloak?.updateToken(minValiditySeconds).catch((error) => {
            console.error('❌ Token refresh failed:', error)
            // Only logout if refresh explicitly fails, not just because token is still valid
            if (error?.message?.includes('Failed to refresh')) {
              this.logout()
            }
          })
        }, 60000) // Check every minute
      }

      return authenticated
    } catch (error) {
      console.error('❌ Keycloak init failed:', error)
      return false
    }
  }

  /**
   * Redirect to Keycloak login page.
   */
  async login(): Promise<void> {
    if (!this.keycloak) {
      throw new Error('Keycloak not initialized')
    }
    await this.keycloak.login()
  }

  /**
   * Logout and redirect to Keycloak logout page.
   */
  async logout(): Promise<void> {
    if (!this.keycloak) {
      throw new Error('Keycloak not initialized')
    }
    await this.keycloak.logout()
  }

  /**
   * Refresh access token if it expires within the specified time.
   *
   * @param minValidity - Refresh if token expires in next N seconds (default: 5 min)
   * @returns Promise<boolean> - true if token was refreshed
   */
  async refreshToken(minValidity: number = 300): Promise<boolean> {
    if (!this.keycloak) {
      throw new Error('Keycloak not initialized')
    }

    try {
      const refreshed = await this.keycloak.updateToken(minValidity)
      if (refreshed) {
        console.log('✅ Token refreshed')
      }
      return refreshed || false
    } catch (error) {
      console.error('❌ Token refresh failed:', error)
      await this.logout()
      return false
    }
  }

  /**
   * Get current JWT access token.
   *
   * @returns string | undefined - JWT token or undefined if not authenticated
   */
  getToken(): string | undefined {
    return this.keycloak?.token
  }

  /**
   * Check if user is authenticated.
   *
   * @returns boolean - true if authenticated
   */
  isAuthenticated(): boolean {
    return this.keycloak?.authenticated || false
  }

  /**
   * Get current user information from JWT token.
   *
   * @returns AuthUser | null - User object or null if not authenticated
   */
  getUser(): AuthUser | null {
    if (!this.keycloak?.tokenParsed) {
      return null
    }

    const token = this.keycloak.tokenParsed
    return {
      id: token.sub || '',
      username: token.preferred_username || '',
      email: token.email,
      roles: this.extractRoles(token)
    }
  }

  /**
   * Extract roles from JWT token claims.
   * Supports both realm_access and resource_access (client-specific roles).
   *
   * @param token - Decoded JWT token
   * @returns string[] - Array of role names
   */
  private extractRoles(token: any): string[] {
    const roles: string[] = []

    // Realm-level roles (e.g., ldap_admin, ldap_editor)
    const realmRoles = token.realm_access?.roles || []
    roles.push(...realmRoles.filter((r: string) => r.startsWith('ldap_')).map((r: string) => r.replace('ldap_', '')))

    // Client-level roles (preferred)
    const clientRoles = token.resource_access?.[this.config.clientId]?.roles || []
    roles.push(...clientRoles)

    // Deduplicate roles
    return [...new Set(roles)]
  }

  /**
   * Check if user has specific role.
   *
   * @param role - Role name to check
   * @returns boolean - true if user has the role
   */
  hasRole(role: string): boolean {
    return this.getUser()?.roles.includes(role) || false
  }

  /**
   * Check if user has admin role.
   */
  isAdmin(): boolean {
    return this.hasRole('admin')
  }

  /**
   * Check if user has editor role (or admin).
   */
  isEditor(): boolean {
    return this.hasRole('editor') || this.isAdmin()
  }

  /**
   * Check if user has viewer role (or higher).
   */
  isViewer(): boolean {
    return this.hasRole('viewer') || this.isEditor()
  }

  /**
   * Check if user has auditor role (or admin).
   */
  isAuditor(): boolean {
    return this.hasRole('auditor') || this.isAdmin()
  }
}

// Singleton instance
let keycloakService: KeycloakService | null = null

/**
 * Get the global Keycloak service instance.
 *
 * @returns KeycloakService - Singleton instance
 */
export function getKeycloakService(): KeycloakService {
  if (!keycloakService) {
    keycloakService = new KeycloakService({
      url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
      realm: import.meta.env.VITE_KEYCLOAK_REALM || 'ldap-manager',
      clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'ldap-manager-client'
    })
  }
  return keycloakService
}
