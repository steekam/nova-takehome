import { queryOptions } from '@tanstack/react-query'
import type { ApiPrincipal } from '@nova/shared'
import { ApiError, apiClient } from './api-client'

export const currentUserQuery = queryOptions({
  queryKey: ['auth', 'me'],
  retry: false,
  queryFn: async (): Promise<ApiPrincipal | null> => {
    try {
      const { data } = await apiClient.GET('/api/auth/me')
      return data ?? null
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return null
      }
      throw error
    }
  },
})
