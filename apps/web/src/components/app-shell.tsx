import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { BookOpen, LayoutDashboard, Settings2 } from 'lucide-react'
import type { UserRole } from '@nova/shared'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { apiClient } from '../lib/api-client'

interface AppShellProps {
  role: UserRole
  children: ReactNode
}

export function AppShell({ role, children }: AppShellProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isTeacher = role === 'teacher'
  const roleLabel = isTeacher ? 'Teacher' : 'Curriculum lead'
  const rolePath = isTeacher ? '/teacher' : '/curriculum-lead'
  const sectionLabel = isTeacher ? 'My lesson plans' : 'Review queue'

  async function signOut() {
    await apiClient.POST('/api/auth/logout').catch(() => undefined)
    queryClient.removeQueries({ queryKey: ['auth'] })
    await navigate({ to: '/login' })
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background md:flex md:flex-col">
        <Link to={rolePath} className="flex h-16 items-center gap-3 px-5 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-4" aria-hidden="true" />
          </span>
          Nova
        </Link>
        <Separator />
        <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
          <Link to={rolePath} className="flex items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">
            <LayoutDashboard className="size-4" aria-hidden="true" /> Overview
          </Link>
          <p className="px-3 pt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{sectionLabel}</p>
        </nav>
        <Separator />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Settings2 className="size-4" aria-hidden="true" /> Workspace settings
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{roleLabel}</p>
              <p className="text-xs text-muted-foreground">Signed in</p>
            </div>
            <Button size="sm" variant="ghost" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </aside>
      <div className="md:pl-64">
        <header className="flex h-16 items-center justify-between border-b bg-background px-5 md:px-8">
          <span className="text-sm text-muted-foreground">Curriculum workspace</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{roleLabel}</span>
            <Button className="md:hidden" size="sm" variant="outline" onClick={signOut}>Sign out</Button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-5 md:p-8">{children}</main>
      </div>
    </div>
  )
}
