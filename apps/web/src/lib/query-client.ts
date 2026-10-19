import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api-client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        failureCount < 1 && (error instanceof ApiError ? error.status >= 500 : error instanceof TypeError),
    },
    mutations: { retry: false },
  },
})
