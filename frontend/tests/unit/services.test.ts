import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClusterService } from '@/services/api/ClusterService'
import { EntryService } from '@/services/api/EntryService'
import { PasswordService } from '@/services/api/PasswordService'
import { ConnectionService } from '@/services/api/ConnectionService'
import { IHttpClient } from '@/services/interfaces/IHttpClient'

describe('ClusterService', () => {
  let mockHttpClient: IHttpClient
  let clusterService: ClusterService

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }
    clusterService = new ClusterService(mockHttpClient)
  })

  it('should fetch clusters', async () => {
    const mockClusters = [{ name: 'test', host: 'localhost', port: 389 }]
    vi.mocked(mockHttpClient.get).mockResolvedValue({ clusters: mockClusters })

    const result = await clusterService.getClusters()

    expect(mockHttpClient.get).toHaveBeenCalledWith('/api/clusters/list')
    expect(result).toEqual(mockClusters)
  })

  it('should fetch cluster health', async () => {
    const mockHealth = { status: 'healthy', nodes: [] }
    vi.mocked(mockHttpClient.get).mockResolvedValue(mockHealth)

    const result = await clusterService.getClusterHealth('test')

    expect(mockHttpClient.get).toHaveBeenCalledWith('/api/clusters/health/test')
    expect(result).toEqual(mockHealth)
  })

  it('should fetch cluster columns', async () => {
    const mockColumns = { users: [{ name: 'uid', label: 'User ID', default_visible: true }] }
    vi.mocked(mockHttpClient.get).mockResolvedValue(mockColumns)

    const result = await clusterService.getClusterColumns('test')

    expect(mockHttpClient.get).toHaveBeenCalledWith('/api/clusters/columns/test')
    expect(result).toEqual(mockColumns)
  })

  it('should fetch cluster form', async () => {
    const mockForm = { base_ou: 'ou=users', object_classes: ['inetOrgPerson'], fields: [] }
    vi.mocked(mockHttpClient.get).mockResolvedValue(mockForm)

    const result = await clusterService.getClusterForm('test')

    expect(mockHttpClient.get).toHaveBeenCalledWith('/api/clusters/form/test')
    expect(result).toEqual(mockForm)
  })
})

describe('EntryService', () => {
  let mockHttpClient: IHttpClient
  let entryService: EntryService

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }
    entryService = new EntryService(mockHttpClient)
  })

  it('should search entries', async () => {
    const mockResult = { entries: [{ dn: 'uid=test', uid: 'test' }], total: 1, has_more: false }
    vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult)

    const result = await entryService.searchEntries({ cluster: 'test', page: 1, page_size: 10 })

    expect(mockHttpClient.get).toHaveBeenCalledWith('/api/entries/search', {
      cluster: 'test', page: 1, page_size: 10
    })
    expect(result).toEqual(mockResult)
  })

  it('should create entry', async () => {
    vi.mocked(mockHttpClient.post).mockResolvedValue(undefined)

    await entryService.createEntry('test', 'uid=user,ou=users', { uid: 'user' })

    expect(mockHttpClient.post).toHaveBeenCalledWith('/api/entries/create', {
      cluster_name: 'test',
      dn: 'uid=user,ou=users',
      attributes: { uid: 'user' }
    })
  })

  it('should update entry', async () => {
    vi.mocked(mockHttpClient.put).mockResolvedValue(undefined)

    await entryService.updateEntry('test', 'uid=user,ou=users', { cn: 'New Name' })

    expect(mockHttpClient.put).toHaveBeenCalledWith('/api/entries/update', {
      cluster_name: 'test',
      dn: 'uid=user,ou=users',
      modifications: { cn: 'New Name' }
    })
  })

  it('should delete entry', async () => {
    vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined)

    await entryService.deleteEntry('test', 'uid=user,ou=users')

    expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/entries/delete', {
      cluster_name: 'test',
      dn: 'uid=user,ou=users'
    })
  })
})

describe('PasswordService', () => {
  let mockHttpClient: IHttpClient
  let passwordService: PasswordService

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }
    passwordService = new PasswordService(mockHttpClient)
  })

  it('should check password cache', async () => {
    vi.mocked(mockHttpClient.get).mockResolvedValue({ cached: true })

    const result = await passwordService.checkPasswordCache('test')

    expect(mockHttpClient.get).toHaveBeenCalledWith('/api/password/check/test')
    expect(result).toEqual({ cached: true })
  })

  it('should change password', async () => {
    vi.mocked(mockHttpClient.post).mockResolvedValue(undefined)

    await passwordService.changePassword('test', 'uid=user,ou=users', 'newpass')

    expect(mockHttpClient.post).toHaveBeenCalledWith('/api/password/change', {
      cluster_name: 'test',
      dn: 'uid=user,ou=users',
      new_password: 'newpass'
    })
  })
})

describe('ConnectionService', () => {
  let mockHttpClient: IHttpClient
  let connectionService: ConnectionService

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }
    connectionService = new ConnectionService(mockHttpClient)
  })

  it('should connect to cluster', async () => {
    vi.mocked(mockHttpClient.post).mockResolvedValue(undefined)

    await connectionService.connect('test', 'password')

    expect(mockHttpClient.post).toHaveBeenCalledWith('/api/connection/connect', {
      cluster_name: 'test',
      bind_password: 'password'
    })
  })
})
