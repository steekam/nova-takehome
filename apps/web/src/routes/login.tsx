import { useState, type FormEvent } from 'react'
import { createRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { ApiError, apiClient } from '../lib/api-client'
import { currentUserQuery } from '../lib/current-user'
import { queryClient } from '../lib/query-client'
import { homeForUser, safeRedirectTarget } from '../lib/route-auth'
import { route as rootRoute } from './root'

function LoginPage() {
  const navigate = useNavigate()
  const router = useRouter()
  const { redirect: returnTo } = loginRoute.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function signIn(credentials: { email: string; password: string }) {
    setError(undefined)
    setIsSubmitting(true)

    try {
      const { data } = await apiClient.POST('/api/auth/login', { body: credentials })
      if (!data) throw new Error('The server returned an empty login response.')
      queryClient.clear()
      queryClient.setQueryData(['auth', 'me'], data.user)
      const target = safeRedirectTarget(returnTo)
      if (target) router.history.push(target)
      else await navigate({ to: homeForUser(data.user) })
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not reach Curriculum Design Hub. Check your connection and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await signIn({ email, password })
  }

  async function signInAsDemoAccount(account: 'teacher' | 'curriculum-lead') {
    await signIn({
      email: account === 'teacher' ? 'teacher@example.test' : 'curriculum-lead@example.test',
      password: 'NovaLocal123!',
    })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img
            src="/brand/nova-pioneer-mark.svg"
            alt="Nova Pioneer"
            className="mx-auto size-14 object-contain"
          />
          <CardTitle>Curriculum Design Hub</CardTitle>
        </CardHeader>
        <CardContent>
          <section aria-labelledby="demo-accounts-title" className="mb-5 space-y-3">
            <div>
              <h2 id="demo-accounts-title" className="text-sm font-semibold">
                Try a demo account
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                One click signs you in with sample data.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                disabled={isSubmitting}
                onClick={() => signInAsDemoAccount('teacher')}
                type="button"
                variant="outline"
              >
                {isSubmitting ? 'Signing in…' : 'Continue as teacher'}
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => signInAsDemoAccount('curriculum-lead')}
                type="button"
                variant="outline"
              >
                {isSubmitting ? 'Signing in…' : 'Continue as curriculum lead'}
              </Button>
            </div>
          </section>
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
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    if (typeof search.redirect !== 'string') return {}
    return { redirect: search.redirect }
  },
  beforeLoad: async () => {
    const user = await queryClient.fetchQuery(currentUserQuery)
    if (user) throw redirect({ to: homeForUser(user) })
  },
  component: LoginPage,
})

export const route = loginRoute
