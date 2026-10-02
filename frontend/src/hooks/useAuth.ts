import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services'
import type { AuthStatus, BuiltInUser, Role } from '@/services/api/AuthService'

export const AUTH_STATUS_KEY = ['auth', 'status'] as const

/**
 * Public status: whether to show nothing (mode=none), a login form, or the
 * first-run wizard. Drives AuthGate.
 */
export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: AUTH_STATUS_KEY,
    queryFn: () => authService.getStatus(),
    staleTime: 30_000,
    retry: false,
  })
}

function useRefreshAuth() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY })
}

export function useLogin() {
  const refresh = useRefreshAuth()
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authService.login(username, password),
    onSuccess: refresh,
  })
}

export function useLogout() {
  const refresh = useRefreshAuth()
  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: refresh,
  })
}

export function useSetup() {
  const refresh = useRefreshAuth()
  return useMutation({
    mutationFn: (users: Array<{ username: string; password: string; role: Role }>) =>
      authService.setup(users),
    onSuccess: refresh,
  })
}

export function useBuiltInUsers(enabled: boolean) {
  return useQuery<{ mode: string; users: BuiltInUser[] }>({
    queryKey: ['auth', 'users'],
    queryFn: () => authService.listUsers(),
    enabled,
    retry: false,
  })
}

export function useUpsertUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ username, password, role }: { username: string; password: string; role: Role }) =>
      authService.upsertUser(username, password, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'users'] }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (username: string) => authService.deleteUser(username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'users'] }),
  })
}

/**
 * UI gating only - the server enforces every rule independently. Use this to
 * hide what a role cannot do, never to rely on it.
 */
export function useHasRole(status: AuthStatus | undefined, ...roles: Role[]): boolean {
  if (!status) return false
  return roles.includes(status.role)
}
