import axios, { AxiosInstance } from 'axios'
import { IHttpClient } from '../interfaces/IHttpClient'

export class AxiosHttpClient implements IHttpClient {
  private client: AxiosInstance

  constructor(baseURL?: string) {
    this.client = axios.create({ baseURL })
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
