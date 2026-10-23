import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { homeFor, useAuth } from './AuthContext'
import { Spinner } from '../components/ui'
import type { Role } from '../lib/types'

/** Solo entra quien tiene sesión y uno de los roles indicados. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="grid min-h-dvh place-items-center"><Spinner label="Abriendo tu sesión" /></div>
  if (!user) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/** Pantallas como el login: si ya hay sesión, lleva al inicio del rol. */
export function PublicOnly() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-dvh place-items-center"><Spinner label="Abriendo tu sesión" /></div>
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}
