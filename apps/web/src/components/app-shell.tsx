import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { BookOpenCheck, LayoutDashboard, LibraryBig } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LlmMockScenarioSchema, type Permission } from '@nova/shared'
import { Button } from './ui/button'
import { apiClient } from '../lib/api-client'
import {
  getRuntimeLlmMode,
  runtimeLlmKey,
  setRuntimeLlmMode,
  type LlmMode,
  type LlmMockScenario,
} from '../features/runtime-llm/api'
import { logoutAndClear } from '../lib/auth-session'
type NavItem = {
  to: '/teacher' | '/curriculum-lead' | '/lesson-plans' | '/library'
  label: string
  icon: LucideIcon
}

function LlmModeControl({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: runtimeLlmKey, queryFn: getRuntimeLlmMode })
  const updateMode = useMutation({
    mutationFn: ({ mode, mockScenario }: { mode: LlmMode; mockScenario?: LlmMockScenario }) =>
      setRuntimeLlmMode(mode, mockScenario),
    onSuccess: (status) => queryClient.setQueryData(runtimeLlmKey, status),
  })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {settings.data && (
        <span className="text-xs text-muted-foreground">AI mode: {settings.data.mode}</span>
      )}
      {canManage && (
        <>
          <label htmlFor="llm-mode" className="text-xs font-medium text-muted-foreground">
            AI mode
          </label>
          <select
            id="llm-mode"
            className="h-8 rounded-md border bg-background px-2 text-xs font-medium"
            disabled={!settings.data || updateMode.isPending}
            onChange={(event) =>
              updateMode.mutate({ mode: event.target.value === 'live' ? 'live' : 'mock' })
            }
            value={settings.data?.mode ?? 'mock'}
          >
            <option value="mock">Mock · no key</option>
            <option value="live">Live · configured provider</option>
          </select>
          {settings.data?.mode === 'mock' && (
            <>
              <label htmlFor="llm-mock-scenario" className="sr-only">
                Mock response scenario
              </label>
              <select
                id="llm-mock-scenario"
                aria-label="Mock response scenario"
                className="h-8 rounded-md border bg-background px-2 text-xs font-medium"
                disabled={updateMode.isPending}
                value={settings.data.mockScenario}
                onChange={(event) => {
                  const scenario = LlmMockScenarioSchema.safeParse(event.target.value)
                  if (scenario.success)
                    updateMode.mutate({ mode: 'mock', mockScenario: scenario.data })
                }}
              >
                <option value="happy_path">Mock response · success</option>
                <option value="invalid_output">Mock response · invalid output</option>
                <option value="connection_failure">Mock response · unavailable</option>
              </select>
            </>
          )}
        </>
      )}
      {settings.data && !settings.data.liveAvailable && (
        <details className="max-w-sm text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-primary">Live setup</summary>
          <p className="mt-1">
            Add {settings.data.missing.join(', ')} to .env.local, then restart the API to enable
            live calls.
          </p>
        </details>
      )}
      {updateMode.error && (
        <span role="alert" className="text-xs text-destructive">
          {updateMode.error.message}
        </span>
      )}
    </div>
  )
}

interface AppShellProps {
  permissions: Permission[]
  children: ReactNode
}

function navFor(permissions: Permission[]): NavItem[] {
  return isCurriculumLead(permissions)
    ? [
        { to: '/curriculum-lead', label: 'Overview', icon: LayoutDashboard },
        { to: '/library', label: 'Curriculum Library', icon: LibraryBig },
        { to: '/lesson-plans', label: 'Lesson Plans', icon: BookOpenCheck },
      ]
    : [
        { to: '/teacher', label: 'Overview', icon: LayoutDashboard },
        { to: '/library', label: 'Curriculum Library', icon: LibraryBig },
        { to: '/lesson-plans', label: 'Lesson Plans', icon: BookOpenCheck },
      ]
}

function isCurriculumLead(permissions: Permission[]) {
  return permissions.includes('lesson_plan:review')
}

function isActiveItem(pathname: string, item: NavItem) {
  if (item.to === '/lesson-plans')
    return (
      pathname === item.to ||
      pathname.startsWith('/teacher/plans/') ||
      pathname.startsWith('/curriculum-lead/reviews/')
    )
  if (item.to === '/teacher' || item.to === '/curriculum-lead') return pathname === item.to
  if (pathname === item.to) return true
  return item.to === '/library' && pathname.startsWith(`${item.to}/`)
}

function Navigation({
  items,
  pathname,
  mobile = false,
}: {
  items: NavItem[]
  pathname: string
  mobile?: boolean
}) {
  return (
    <nav
      aria-label="Main navigation"
      className={mobile ? 'flex min-w-max gap-1 px-3 py-2' : 'space-y-1 p-3'}
    >
      {items.map((item) => {
        const active = isActiveItem(pathname, item)
        const Icon = item.icon
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={
              mobile
                ? `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
                : `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${active ? 'bg-white/10 text-white ring-1 ring-inset ring-white/10' : 'text-sky-100/75 hover:bg-white/10 hover:text-white'}`
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function AppShell({ permissions, children }: AppShellProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isLead = isCurriculumLead(permissions)
  const roleLabel = isLead ? 'Curriculum lead' : 'Teacher'
  const items = navFor(permissions)

  const signOut = useMutation({
    mutationFn: () =>
      logoutAndClear(
        () => apiClient.POST('/api/auth/logout'),
        () => queryClient.clear(),
      ),
    onSuccess: async () => {
      await navigate({ to: '/login' })
    },
  })

  return (
    <div className="min-h-svh bg-muted/30">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 font-medium shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#173f52] bg-[#092b3b] text-white md:flex md:flex-col">
        <Link
          to={isLead ? '/curriculum-lead' : '/teacher'}
          className="flex h-20 items-center gap-3 px-5 font-semibold tracking-tight text-white"
        >
          <img
            src="/brand/nova-pioneer-mark.svg"
            alt=""
            className="size-10 shrink-0 object-contain"
          />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold tracking-[0.14em] text-sky-100/70">
              NOVA PIONEER
            </span>
            <span className="block text-sm leading-tight">Curriculum Design Hub</span>
          </span>
        </Link>
        <div className="mx-5 h-px bg-white/15" />
        <Navigation items={items} pathname={pathname} />
        <div className="mt-auto space-y-3 border-t border-white/15 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-white">{roleLabel}</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-sky-100 hover:bg-white/10 hover:text-white"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </div>
      </aside>
      <div className="md:pl-64">
        <header className="flex min-h-16 flex-wrap items-center justify-end gap-3 border-b bg-card px-5 py-2 md:px-8">
          <div className="flex items-center gap-3">
            {signOut.error && (
              <p role="alert" className="text-sm text-destructive">
                Sign out failed: {signOut.error.message}
              </p>
            )}
            <LlmModeControl canManage={permissions.includes('runtime_llm:manage')} />
            <Button
              className="md:hidden"
              size="sm"
              variant="outline"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </header>
        <div className="sticky top-0 z-20 overflow-x-auto border-b bg-card md:hidden">
          <Navigation items={items} pathname={pathname} mobile />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1500px] p-5 md:p-8 focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
