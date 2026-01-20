import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clusterService, passwordService, connectionService, entryService } from '@/services'

export const useClusterInfo = (clusterName: string) => {
  return useQuery({
    queryKey: ['cluster', clusterName],
    queryFn: async () => {
      const clusters = await clusterService.getClusters()
      return clusters.find((c) => c.name === clusterName)
    },
    enabled: !!clusterName,
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
