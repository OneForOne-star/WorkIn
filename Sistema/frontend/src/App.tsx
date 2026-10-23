import { Navigate, Route, Routes } from 'react-router-dom'
import { Banknote, Clock, Building2, LayoutDashboard, Building, CalendarCheck, CalendarDays, House, MapPin, QrCode, Search, ShieldCheck, Users, Wallet } from 'lucide-react'
import { homeFor, useAuth } from './auth/AuthContext'
import { PublicOnly, RequireRole } from './auth/guards'
import { AppShell, type NavItem } from './components/AppShell'
import Login from './pages/auth/Login'
import Register, { ResendVerification } from './pages/auth/Register'
import { CreatePassword, ForgotPassword, ResetPassword } from './pages/auth/PasswordPages'
import Companies from './pages/superadmin/Companies'
import CompanyDetail from './pages/superadmin/CompanyDetail'
import Resumen, { useMyCompany } from './pages/empresa/Resumen'
import Admins from './pages/empresa/Admins'
import Lugares from './pages/empresa/Lugares'
import Tarifas from './pages/empresa/Tarifas'
import Pagos from './pages/empresa/Pagos'
import PagoDetalle from './pages/empresa/PagoDetalle'
import HorasExtra from './pages/empresa/HorasExtra'
import PagoSimulacion from './pages/empresa/PagoSimulacion'
import PagoPorCerrar from './pages/empresa/PagoPorCerrar'
import MisPagos from './pages/trabajador/MisPagos'
import Trabajadores from './pages/empresa/Trabajadores'
import Turnos from './pages/empresa/Turnos'
import TurnoDetalle from './pages/empresa/TurnoDetalle'
import TrabajadorInicio from './pages/trabajador/Inicio'
import Ofertas from './pages/trabajador/Ofertas'
import MisTurnos from './pages/trabajador/MisTurnos'
import Marcar from './pages/trabajador/Marcar'
import MisEmpresas from './pages/trabajador/Empresas'
import Pantalla from './pages/publico/Pantalla'
import { Button, PageHeader } from './components/ui'

const superNav: NavItem[] = [{ to: '/superadmin', label: 'Empresas', icon: Building2, end: false }]

function SuperShell() {
  return <AppShell items={superNav} context="Equipo WorkIn" />
}

function EmpresaShell() {
  const { user } = useAuth()
  const company = useMyCompany()
  const items: NavItem[] = [{ to: '/empresa', label: 'Resumen', icon: LayoutDashboard, end: true }]
  items.push({ to: '/empresa/turnos', label: 'Turnos', icon: CalendarDays }, { to: '/empresa/trabajadores', label: 'Trabajadores', icon: Users }, { to: '/empresa/lugares', label: 'Lugares', icon: MapPin }, { to: '/empresa/horas-extra', label: 'Horas extra', icon: Clock }, { to: '/empresa/pagos', label: 'Pagos', icon: Banknote }, { to: '/empresa/tarifas', label: 'Tarifas', icon: Wallet })
  if (user?.role === 'company_owner') items.push({ to: '/empresa/administradores', label: 'Administradores', icon: ShieldCheck })
  return <AppShell items={items} context={company.data?.name ?? user?.company?.name ?? undefined} />
}

function TrabajadorShell() {
  const items: NavItem[] = [
    { to: '/trabajador', label: 'Inicio', icon: House, end: true },
    { to: '/trabajador/ofertas', label: 'Ofertas', icon: Search },
    { to: '/trabajador/turnos', label: 'Mis turnos', icon: CalendarCheck },
    { to: '/trabajador/marcar', label: 'Marcar asistencia', icon: QrCode },
    { to: '/trabajador/pagos', label: 'Mis pagos', icon: Banknote },
    { to: '/trabajador/empresas', label: 'Mis empresas', icon: Building },
  ]
  return <AppShell items={items} context="Mi cuenta" />
}

function Home() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? homeFor(user.role) : '/ingresar'} replace />
}

function NotFound() {
  const { user } = useAuth()
  return (
    <div className="grid min-h-dvh place-items-center p-8">
      <div className="max-w-sm text-center">
        <PageHeader title="No encontramos esa página" subtitle="Revisa la dirección o vuelve al inicio." />
        <a href={user ? homeFor(user.role) : '/ingresar'}><Button>Ir al inicio</Button></a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      {/* Pantalla del QR: pública, la credencial es el enlace */}
      <Route path="/pantalla/:token" element={<Pantalla />} />

      {/* Acceso */}
      <Route element={<PublicOnly />}>
        <Route path="/ingresar" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/registro/reenviar" element={<ResendVerification />} />
        <Route path="/recuperar" element={<ForgotPassword />} />
      </Route>
      {/* Estos enlaces llegan por correo; deben abrir aunque haya otra sesión iniciada */}
      <Route path="/restablecer" element={<ResetPassword />} />
      <Route path="/crear-contrasena" element={<CreatePassword />} />

      {/* Equipo WorkIn */}
      <Route element={<RequireRole roles={['super_admin']} />}>
        <Route element={<SuperShell />}>
          <Route path="/superadmin" element={<Companies />} />
          <Route path="/superadmin/empresas/:id" element={<CompanyDetail />} />
        </Route>
      </Route>

      {/* Empresa */}
      <Route element={<RequireRole roles={['company_owner', 'admin']} />}>
        <Route element={<EmpresaShell />}>
          <Route path="/empresa" element={<Resumen />} />
          <Route path="/empresa/turnos" element={<Turnos />} />
          <Route path="/empresa/turnos/:id" element={<TurnoDetalle />} />
          <Route path="/empresa/trabajadores" element={<Trabajadores />} />
          <Route path="/empresa/lugares" element={<Lugares />} />
          <Route path="/empresa/horas-extra" element={<HorasExtra />} />
          <Route path="/empresa/pagos" element={<Pagos />} />
          <Route path="/empresa/pagos/por-cerrar" element={<PagoPorCerrar />} />
          <Route path="/empresa/pagos/simulacion" element={<PagoSimulacion />} />
          <Route path="/empresa/pagos/:id" element={<PagoDetalle />} />
          <Route path="/empresa/tarifas" element={<Tarifas />} />
          <Route element={<RequireRole roles={['company_owner']} />}>
            <Route path="/empresa/administradores" element={<Admins />} />
          </Route>
        </Route>
      </Route>

      {/* Trabajador */}
      <Route element={<RequireRole roles={['trabajador']} />}>
        <Route element={<TrabajadorShell />}>
          <Route path="/trabajador" element={<TrabajadorInicio />} />
          <Route path="/trabajador/ofertas" element={<Ofertas />} />
          <Route path="/trabajador/turnos" element={<MisTurnos />} />
          <Route path="/trabajador/marcar" element={<Marcar />} />
          <Route path="/trabajador/pagos" element={<MisPagos />} />
          <Route path="/trabajador/empresas" element={<MisEmpresas />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
