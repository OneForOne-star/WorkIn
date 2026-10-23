import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, setUnauthorizedHandler, tokenStore } from '../lib/api'
import type { Role, User } from '../lib/types'

interface AuthState {
  user: User | null
  /** true mientras se comprueba si la sesión guardada sigue vigente */
  loading: boolean
  login: (identifier: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function homeFor(role: Role): string {
  switch (role) {
    case 'super_admin': return '/superadmin'
    case 'admin':
    case 'company_owner': return '/empresa'
    default: return '/trabajador'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(() => tokenStore.get() !== null)

  // Si cualquier llamada recibe 401, se cierra la sesión local.
  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); qc.clear() })
    return () => setUnauthorizedHandler(null)
  }, [qc])

  // Al abrir la web, recupera la sesión guardada.
  useEffect(() => {
    if (!tokenStore.get()) return
    let alive = true
    api<{ user: User }>('/auth/me')
      .then((r) => { if (alive) setUser(r.user) })
      .catch(() => { /* el manejador de 401 ya limpió; otros errores dejan al usuario en el login */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const login = useCallback(async (identifier: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: { identifier, password }, auth: false,
    })
    tokenStore.set(r.token)
    qc.clear()
    setUser(r.user)
    return r.user
  }, [qc])

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* si falla igual se cierra aquí */ }
    tokenStore.clear()
    qc.clear()
    setUser(null)
  }, [qc])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fuera de AuthProvider')
  return v
}
