import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { BookOpenCheck, LayoutDashboard, LibraryBig } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '@nova/shared'
import { Button } from './ui/button'
import { apiClient } from '../lib/api-client'
import { apiRequest } from '../lib/api-request'

type LlmMode = 'mock' | 'live'
type LlmModeStatus = { mode: LlmMode; liveAvailable: boolean; missing: string[] }
type NavItem = { to: '/teacher' | '/curriculum-lead' | '/lesson-plans' | '/library'; label: string; icon: LucideIcon }

function LlmModeControl() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['runtime-llm-mode'], queryFn: () => apiRequest<LlmModeStatus>('/api/runtime/llm') })
  const updateMode = useMutation({
    mutationFn: (mode: LlmMode) => apiRequest<LlmModeStatus>('/api/runtime/llm', { method: 'PUT', body: JSON.stringify({ mode }) }),
    onSuccess: (status) => queryClient.setQueryData(['runtime-llm-mode'], status),
  })

  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <label htmlFor="llm-mode" className="text-xs font-medium text-muted-foreground">LLM mode</label>
    <select id="llm-mode" className="h-8 rounded-md border bg-background px-2 text-xs font-medium" disabled={!settings.data || updateMode.isPending} onChange={(event) => updateMode.mutate(event.target.value === 'live' ? 'live' : 'mock')} value={settings.data?.mode ?? 'mock'}>
      <option value="mock">Mock · no key</option>
      <option value="live">Live · configured provider</option>
    </select>
    {settings.data && !settings.data.liveAvailable && <span className="max-w-sm text-xs text-muted-foreground">Live needs {settings.data.missing.join(', ')} in .env.local, then restart the API.</span>}
    {updateMode.error && <span role="alert" className="text-xs text-destructive">{updateMode.error.message}</span>}
  </div>
}

interface AppShellProps {
  role: UserRole
  children: ReactNode
}

function navFor(role: UserRole): NavItem[] {
  return role === 'teacher'
    ? [
        { to: '/teacher', label: 'Overview', icon: LayoutDashboard },
        { to: '/library', label: 'Curriculum Library', icon: LibraryBig },
        { to: '/lesson-plans', label: 'Lesson Plans', icon: BookOpenCheck },
      ]
    : [
        { to: '/curriculum-lead', label: 'Overview', icon: LayoutDashboard },
        { to: '/library', label: 'Curriculum Library', icon: LibraryBig },
        { to: '/lesson-plans', label: 'Lesson Plans', icon: BookOpenCheck },
      ]
}

function isActiveItem(pathname: string, item: NavItem) {
  if (pathname === item.to) return true
  if (item.to === '/teacher' || item.to === '/curriculum-lead' || item.to === '/library') return pathname.startsWith(`${item.to}/`)
  return false
}

export function AppShell({ role, children }: AppShellProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: state => state.location.pathname })
  const isTeacher = role === 'teacher'
  const roleLabel = isTeacher ? 'Teacher' : 'Curriculum lead'
  const items = navFor(role)

  const signOut = useMutation({
    mutationFn: () => apiClient.POST('/api/auth/logout'),
    onSuccess: async () => {
      queryClient.clear()
      await navigate({ to: '/login' })
    },
  })

  function Navigation({ mobile = false }: { mobile?: boolean }) {
    return <nav aria-label={mobile ? 'Main navigation' : 'Main navigation'} className={mobile ? 'flex min-w-max gap-1 px-3 py-2' : 'space-y-1 p-3'}>
      {items.map(item => {
        const active = isActiveItem(pathname, item)
        const Icon = item.icon
        return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className={mobile
          ? `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
          : `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${active ? 'bg-white/10 text-white ring-1 ring-inset ring-white/10' : 'text-sky-100/75 hover:bg-white/10 hover:text-white'}`}>
          <Icon className="size-4 shrink-0" aria-hidden="true" />{item.label}
        </Link>
      })}
    </nav>
  }

  return <div className="min-h-svh bg-muted/30">
    <a href="#main-content" className="sr-only z-50 rounded-md bg-background px-4 py-2 font-medium shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#173f52] bg-[#092b3b] text-white md:flex md:flex-col">
      <Link to={isTeacher ? '/teacher' : '/curriculum-lead'} className="flex h-20 items-center gap-3 px-5 font-semibold tracking-tight text-white">
        <img src="/brand/nova-pioneer-mark.svg" alt="" className="size-10 shrink-0 object-contain" />
        <span className="min-w-0"><span className="block text-[10px] font-semibold tracking-[0.14em] text-sky-100/70">NOVA PIONEER</span><span className="block text-sm leading-tight">Curriculum Design Hub</span></span>
      </Link>
      <div className="mx-5 h-px bg-white/15" />
      <Navigation />
      <div className="mt-auto space-y-3 border-t border-white/15 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-white">{roleLabel}</p>
          <Button size="sm" variant="ghost" className="text-sky-100 hover:bg-white/10 hover:text-white" disabled={signOut.isPending} onClick={() => signOut.mutate()}>{signOut.isPending ? 'Signing out…' : 'Sign out'}</Button>
        </div>
      </div>
    </aside>
    <div className="md:pl-64">
      <header className="flex min-h-16 flex-wrap items-center justify-end gap-3 border-b bg-card px-5 py-2 md:px-8">
        <div className="flex items-center gap-3">
          {signOut.error && <p role="alert" className="text-sm text-destructive">Sign out failed: {signOut.error.message}</p>}
          <LlmModeControl />
          <Button className="md:hidden" size="sm" variant="outline" disabled={signOut.isPending} onClick={() => signOut.mutate()}>{signOut.isPending ? 'Signing out…' : 'Sign out'}</Button>
        </div>
      </header>
      <div className="sticky top-0 z-20 border-b bg-card md:hidden"><Navigation mobile /></div>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1500px] p-5 md:p-8 focus:outline-none">{children}</main>
    </div>
  </div>
}
