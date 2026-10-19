import { useState, type FormEvent } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { ApiError, apiClient } from '../lib/api-client'
import { queryClient } from '../lib/query-client'
import { route as rootRoute } from './root'

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setIsSubmitting(true)

    try {
      const { data } = await apiClient.POST('/api/auth/login', { body: { email, password } })
      if (!data) throw new Error('The server returned an empty login response.')
      queryClient.setQueryData(['auth', 'me'], data.user)
      await navigate({ to: '/' })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to sign in. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <CardTitle>Sign in to Nova</CardTitle>
          <CardDescription>Use your Nova account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-5" />
          <form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-1.5 text-sm font-medium">
              Email
              <input
                autoComplete="username"
                className="h-9 w-full rounded-md border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Password
              <input
                autoComplete="current-password"
                className="h-9 w-full rounded-md border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})
