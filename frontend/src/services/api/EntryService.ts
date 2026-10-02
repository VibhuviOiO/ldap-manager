import { IHttpClient } from '../interfaces/IHttpClient'
import { SearchParams, SearchResult, LDAPEntry, GroupInfo, UpdateGroupMembershipResponse, DITChild, DITChildren } from '../models'

interface CreateEntryRequest {
  cluster_name: string
  dn: string
  attributes: Record<string, string | string[] | number | boolean>
}

interface UpdateEntryRequest {
  cluster_name: string
  dn: string
  modifications: Record<string, string | string[] | number | boolean>
}

interface DeleteEntryRequest {
  cluster_name: string
  dn: string
}

export class EntryService {
  constructor(private httpClient: IHttpClient) {}

  async searchEntries(params: SearchParams): Promise<SearchResult> {
    return this.httpClient.get<SearchResult>('/api/entries/search', params)
  }

  /** One level of the DIT, for the tree browser. */
  async getChildren(clusterName: string, baseDn?: string): Promise<DITChildren> {
    return this.httpClient.get<DITChildren>('/api/entries/children', {
      cluster: clusterName,
      ...(baseDn ? { base_dn: baseDn } : {}),
    })
  }

  /** All attributes of one entry, for the tree's detail panel. */
  async getEntry(clusterName: string, dn: string): Promise<{ dn: string; attributes: Record<string, string[] | string> }> {
    return this.httpClient.get('/api/entries/get', { cluster: clusterName, dn })
  }

  async bulkUpdate(
    clusterName: string,
    dns: string[],
    modifications: Record<string, string | number | boolean>
  ): Promise<{ status: string; succeeded: string[]; errors: Array<{ dn: string; error: string }> }> {
    return this.httpClient.post('/api/entries/bulk/update', { cluster_name: clusterName, dns, modifications })
  }

  async bulkGroup(
    clusterName: string,
    dns: string[],
    groupDn: string,
    action: 'add' | 'remove'
  ): Promise<{ status: string; succeeded: string[]; errors: Array<{ dn: string; error: string }> }> {
    return this.httpClient.post('/api/entries/bulk/group', {
      cluster_name: clusterName,
      dns,
      group_dn: groupDn,
      action,
    })
  }

  async bulkDelete(clusterName: string, dns: string[]): Promise<{ status: string; succeeded: string[]; errors: Array<{ dn: string; error: string }> }> {
    return this.httpClient.post('/api/entries/bulk/delete', { cluster_name: clusterName, dns })
  }

  async createEntry(clusterName: string, dn: string, attributes: Record<string, string | string[] | number | boolean>): Promise<void> {
    await this.httpClient.post('/api/entries/create', {
      cluster_name: clusterName,
      dn,
      attributes
    })
  }

  async updateEntry(clusterName: string, dn: string, modifications: Record<string, string | string[] | number | boolean>): Promise<void> {
    await this.httpClient.put('/api/entries/update', {
      cluster_name: clusterName,
      dn,
      modifications
    })
  }

  async deleteEntry(clusterName: string, dn: string): Promise<void> {
    await this.httpClient.delete('/api/entries/delete', {
      cluster_name: clusterName,
      dn
    })
  }

  async getAllGroups(clusterName: string): Promise<GroupInfo[]> {
    const response = await this.httpClient.get<{ groups: GroupInfo[] }>(
      '/api/entries/groups/all',
      { cluster: clusterName }
    )
    return response.groups
  }

  async getUserGroups(clusterName: string, userDn: string): Promise<GroupInfo[]> {
    const response = await this.httpClient.get<{ user_dn: string; groups: GroupInfo[] }>(
      '/api/entries/user/groups',
      { cluster: clusterName, user_dn: userDn }
    )
    return response.groups
  }

  async updateUserGroups(
    clusterName: string,
    userDn: string,
    groupsToAdd: string[],
    groupsToRemove: string[]
  ): Promise<UpdateGroupMembershipResponse> {
    return this.httpClient.put<UpdateGroupMembershipResponse>('/api/entries/user/groups', {
      cluster_name: clusterName,
      user_dn: userDn,
      groups_to_add: groupsToAdd,
      groups_to_remove: groupsToRemove
    })
  }
}
