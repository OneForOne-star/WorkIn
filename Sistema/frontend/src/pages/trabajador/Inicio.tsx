import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, QrCode, Search } from 'lucide-react'
import { Button, EmptyState, Notice, PageHeader, Panel, Spinner } from '../../components/ui'
import { useToast } from '../../components/toast'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../lib/api'
import { fmtDateTime, fmtTime } from '../../lib/format'
import type { MyShift } from './types'

interface Invitation { id: number; company: string; invited_at: string }

export default function TrabajadorInicio() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const inv = useQuery({ queryKey: ['trab', 'invitaciones'], queryFn: () => api<{ data: Invitation[] }>('/trabajador/invitaciones').then((r) => r.data) })
  const next = useQuery({ queryKey: ['trab', 'mis-turnos', 'upcoming'], queryFn: () => api<{ data: MyShift[] }>('/trabajador/mis-turnos', { query: { scope: 'upcoming' } }).then((r) => r.data) })

  const respond = useMutation({
    mutationFn: ({ id, verb }: { id: number; verb: 'aceptar' | 'rechazar' }) => api(`/trabajador/invitaciones/${id}/${verb}`, { method: 'POST' }),
    onSuccess: async (_r, v) => {
      await qc.invalidateQueries({ queryKey: ['trab'] })
      toast.ok(v.verb === 'aceptar' ? 'Listo, ya puedes ver las ofertas de esa empresa.' : 'Invitación rechazada.')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos responder la invitación.'),
  })

  const accepted = (next.data ?? []).filter((s) => s.status === 'accepted' && s.shift_status === 'published')
  const upcoming = accepted[0]
  const invitations = inv.data ?? []

  return (
    <>
      <PageHeader title={`Hola, ${user?.first_name}`} subtitle="Aquí ves tus invitaciones y tu próximo turno." />

      {invitations.length > 0 && (
        <section aria-labelledby="h-inv" className="mb-8">
          <h2 id="h-inv" className="mb-3 text-lg font-semibold">Invitaciones</h2>
          <Panel className="overflow-hidden">
            <ul>
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                  <div className="min-w-52 flex-1">
                    <p className="font-medium">{i.company}</p>
                    <p className="text-sm text-tinta-3">te invita a su bolsa de trabajo · {fmtDateTime(i.invited_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={respond.isPending && respond.variables?.id === i.id && respond.variables.verb === 'aceptar'} onClick={() => respond.mutate({ id: i.id, verb: 'aceptar' })}>Aceptar</Button>
                    <Button size="sm" variant="ghost" onClick={() => respond.mutate({ id: i.id, verb: 'rechazar' })}>Rechazar</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="mt-2 text-sm text-tinta-3">Al aceptar, la empresa verá tu nombre, RUT, correo y celular, y podrás ver y postular a sus turnos.</p>
        </section>
      )}

      <section aria-labelledby="h-next" className="mb-8">
        <h2 id="h-next" className="mb-3 text-lg font-semibold">Próximo turno</h2>
        {next.isLoading ? <Spinner /> : next.isError ? <Notice tone="error">No pudimos cargar tus turnos.</Notice> : upcoming ? (
          <Panel className="p-5">
            <p className="text-lg font-semibold">{upcoming.title}</p>
            <p className="mt-1 text-tinta-2">{upcoming.company} · {upcoming.location.name}</p>
            {upcoming.location.address && <p className="text-sm text-tinta-3">{upcoming.location.address}</p>}
            <p className="mt-3 font-medium">{fmtDateTime(upcoming.starts_at)} a {fmtTime(upcoming.ends_at)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/trabajador/marcar"><Button><QrCode className="size-4" aria-hidden /> Marcar asistencia</Button></Link>
              <Link to="/trabajador/turnos"><Button variant="secondary">Ver mis turnos</Button></Link>
            </div>
          </Panel>
        ) : (
          <Panel>
            <EmptyState title="No tienes turnos aceptados" action={<Link to="/trabajador/ofertas"><Button><Search className="size-4" aria-hidden /> Ver ofertas</Button></Link>}>
              Postula a una oferta y, cuando la empresa te acepte, tu turno aparecerá aquí.
            </EmptyState>
          </Panel>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/trabajador/ofertas" className="rounded-panel border border-linea bg-papel p-5 transition-colors hover:bg-arena/60">
          <Search className="mb-3 size-5 text-naranja-fuerte" aria-hidden /><p className="font-medium">Ofertas de turnos</p><p className="mt-1 text-sm text-tinta-3">Mira qué hay disponible y postula.</p>
        </Link>
        <Link to="/trabajador/turnos" className="rounded-panel border border-linea bg-papel p-5 transition-colors hover:bg-arena/60">
          <CalendarCheck className="mb-3 size-5 text-naranja-fuerte" aria-hidden /><p className="font-medium">Mis turnos</p><p className="mt-1 text-sm text-tinta-3">Postulaciones, turnos aceptados e historial.</p>
        </Link>
      </div>
    </>
  )
}
