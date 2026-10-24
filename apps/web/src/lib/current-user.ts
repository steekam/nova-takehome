import { queryOptions } from '@tanstack/react-query'
import { ApiPrincipalSchema, type ApiPrincipal } from '@nova/shared'
import { apiClient } from './api-client'
import { loadCurrentUser } from './auth-session'

export const currentUserQuery = queryOptions({
  queryKey: ['auth', 'me'],
  retry: false,
  queryFn: (): Promise<ApiPrincipal | null> =>
    loadCurrentUser(async () => {
      const { data } = await apiClient.GET('/api/auth/me')
      return data ? ApiPrincipalSchema.parse(data) : null
    }),
})
