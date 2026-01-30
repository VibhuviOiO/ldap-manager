import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { IHttpClient } from '../interfaces/IHttpClient'
import { getKeycloakService } from '../auth/KeycloakService'

export class AxiosHttpClient implements IHttpClient {
  private client: AxiosInstance

  constructor(baseURL?: string) {
    this.client = axios.create({ baseURL })

    // Request interceptor: Add Bearer token to all requests
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const keycloak = getKeycloakService()
        const token = keycloak.getToken()

        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }

        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Response interceptor: Handle 401 (token expired) and retry
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

        // If 401 and not already retried, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true

          const keycloak = getKeycloakService()

          try {
            // Try to refresh token
            const refreshed = await keycloak.refreshToken()

            if (refreshed && originalRequest.headers) {
              // Retry original request with new token
              const token = keycloak.getToken()
              originalRequest.headers.Authorization = `Bearer ${token}`
              return this.client.request(originalRequest)
            } else {
              // Refresh failed, logout
              console.error('❌ Token refresh failed, logging out')
              await keycloak.logout()
            }
          } catch (refreshError) {
            console.error('❌ Token refresh error:', refreshError)
            await keycloak.logout()
          }
        }

        return Promise.reject(error)
      }
    )
  }

  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.get<T>(url, { params })
    return response.data
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data)
    return response.data
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.put<T>(url, data)
    return response.data
  }

  async delete<T>(url: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.delete<T>(url, { params })
    return response.data
  }
}
