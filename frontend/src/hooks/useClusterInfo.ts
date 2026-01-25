import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clusterService, passwordService, connectionService, entryService } from '@/services'
import { SearchParams } from '@/services/models'

export const useClusterInfo = (clusterName: string) => {
  return useQuery({
    queryKey: ['cluster', clusterName],
    queryFn: () => clusterService.getCluster(clusterName),
    enabled: !!clusterName,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
}

export const useEntries = (params: SearchParams) => {
  return useQuery({
    queryKey: ['entries', params.cluster, params.filter_type, params.page, params.page_size, params.search],
    queryFn: () => entryService.searchEntries(params),
    enabled: !!params.cluster && !!params.filter_type,
    staleTime: 30 * 1000, // Cache for 30 seconds
  })
}

export const useTableColumns = (clusterName: string) => {
  return useQuery({
    queryKey: ['tableColumns', clusterName],
    queryFn: () => clusterService.getClusterColumns(clusterName),
    enabled: !!clusterName,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
}

export const useClusters = () => {
  return useQuery({
    queryKey: ['clusters'],
    queryFn: () => clusterService.getClusters(),
  })
}

export const usePasswordCache = (clusterName: string) => {
  return useQuery({
    queryKey: ['passwordCache', clusterName],
    queryFn: () => passwordService.checkPasswordCache(clusterName),
    enabled: !!clusterName,
  })
}

export const useConnect = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clusterName, password }: { clusterName: string; password: string }) =>
      connectionService.connect(clusterName, password),
    onSuccess: (_, { clusterName }) => {
      queryClient.invalidateQueries({ queryKey: ['passwordCache', clusterName] })
    },
  })
}

export const useDeleteEntry = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clusterName, dn }: { clusterName: string; dn: string }) =>
      entryService.deleteEntry(clusterName, dn),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}
