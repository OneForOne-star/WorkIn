import { useEffect, useState, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { LogoMark } from './Brand'
import { cx } from './ui'
import { ROLE_LABEL } from '../lib/format'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  end?: boolean
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => cx(
            'group relative flex items-center gap-3 rounded-control px-3 py-2.5 text-[0.95rem] transition-colors',
            isActive ? 'bg-white/10 font-medium text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
          )}
        >
          {({ isActive }) => (
            <>
              <span className={cx('absolute inset-y-2 left-0 w-[3px] rounded-r bg-naranja transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} aria-hidden />
              <Icon className="size-[1.15rem] shrink-0" aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserBlock() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div className="border-t border-white/10 pt-4">
      <p className="truncate text-sm font-medium text-white">{user.first_name} {user.last_name}</p>
      <p className="truncate text-[0.8rem] text-white/60">{ROLE_LABEL[user.role]}</p>
      <button
        type="button"
        onClick={() => void logout()}
        className="mt-3 inline-flex items-center gap-2 rounded-control px-2 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut className="size-4" aria-hidden /> Cerrar sesión
      </button>
    </div>
  )
}

/** Marco con menú lateral oscuro (en el celular, un menú que se abre desde arriba). */
export function AppShell({ items, context }: { items: NavItem[]; context?: string }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setOpen(false) }, [location.pathname])

  const brand = (
    <div className="flex items-center gap-2.5">
      <LogoMark className="size-8" />
      <div className="min-w-0 leading-tight">
        <p className="text-[1.05rem] font-semibold text-white">WorkIn</p>
        {context && <p className="truncate text-[0.8rem] text-white/60">{context}</p>}
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      {/* Menú fijo en pantallas grandes */}
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between bg-tinta p-5 lg:flex">
        <div className="space-y-8">
          {brand}
          <NavList items={items} />
        </div>
        <UserBlock />
      </aside>

      {/* Barra superior en el celular */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-tinta px-4 py-3 lg:hidden">
        {brand}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          className="grid size-10 place-items-center rounded-control text-white hover:bg-white/10">
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[3.75rem] z-20 space-y-6 bg-tinta px-4 pb-5 pt-2 shadow-xl lg:hidden">
          <NavList items={items} onNavigate={() => setOpen(false)} />
          <UserBlock />
        </div>
      )}

      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>
    </div>
  )
}
