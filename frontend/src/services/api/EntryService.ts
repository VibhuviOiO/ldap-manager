import { IHttpClient } from '../interfaces/IHttpClient'
import { SearchParams, SearchResult, LDAPEntry, GroupInfo, UpdateGroupMembershipResponse } from '../models'

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
