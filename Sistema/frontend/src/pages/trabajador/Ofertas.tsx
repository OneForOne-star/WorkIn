import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, MapPin, Moon } from 'lucide-react'
import { Button, EmptyState, Notice, PageHeader, Panel, Spinner, StatusDot } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { fmtDateTime, fmtMoney, fmtTime } from '../../lib/format'

interface Offer {
  id: number; company: string; title: string; notes: string | null
  location: { name: string; address: string | null }
  starts_at: string; ends_at: string; is_night: boolean; is_holiday: boolean
  pay: { shift_amount: number | null; overtime_hour_amount: number | null }
  slots_left: number; my_status: string | null; assignment_id: number | null; overlaps_my_shifts: boolean
}

export default function Ofertas() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['trab', 'ofertas'], queryFn: () => api<{ data: Offer[] }>('/trabajador/ofertas').then((r) => r.data) })

  const refresh = () => qc.invalidateQueries({ queryKey: ['trab'] })
  const onErr = (e: unknown) => { toast.error(e instanceof ApiError ? e.message : 'No pudimos completar la acción.'); void refresh() }

  const apply = useMutation({
    mutationFn: (o: Offer) => api(`/trabajador/ofertas/${o.id}/postular`, { method: 'POST' }),
    onSuccess: async () => { await refresh(); toast.ok('Postulación enviada. La empresa decidirá y te avisaremos por correo.') }, onError: onErr,
  })
  const withdraw = useMutation({
    mutationFn: (o: Offer) => api(`/trabajador/postulaciones/${o.assignment_id}`, { method: 'DELETE' }),
    onSuccess: async () => { await refresh(); toast.ok('Retiraste tu postulación.') }, onError: onErr,
  })

  const rows = q.data ?? []

  return (
    <>
      <PageHeader title="Ofertas" subtitle="Turnos disponibles de las empresas que te invitaron. Postula y la empresa decide a quién acepta." />

      {q.isLoading ? <Spinner /> : q.isError ? (
        <Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar las ofertas.'}</Notice>
      ) : rows.length === 0 ? (
        <Panel><EmptyState title="No hay ofertas por ahora">Cuando una empresa de tu lista publique un turno, aparecerá aquí. Si aún no tienes empresas, acepta una invitación en Inicio.</EmptyState></Panel>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {rows.map((o) => {
            const applied = o.my_status === 'applied'
            const accepted = o.my_status === 'accepted'
            const full = o.slots_left <= 0
            return (
              <li key={o.id}>
                <Panel className="flex h-full flex-col p-5">
                  <p className="text-sm text-tinta-3">{o.company}</p>
                  <h2 className="mt-0.5 text-lg font-semibold">{o.title} {o.is_night && <Moon className="ml-1 inline size-4 text-tinta-3" aria-label="Turno de noche" />}</h2>
                  {o.pay?.shift_amount != null && (
                    <p className="mt-3 text-lg font-semibold text-naranja-oscuro">{fmtMoney(o.pay?.shift_amount)} <span className="text-sm font-normal text-tinta-2">por turno{o.pay?.overtime_hour_amount ? ` · hora extra ${fmtMoney(o.pay?.overtime_hour_amount)}` : ''}</span></p>
                  )}
                  <p className="mt-2 font-medium">{fmtDateTime(o.starts_at)} a {fmtTime(o.ends_at)}{o.is_holiday ? ' · festivo' : ''}</p>
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-tinta-2"><MapPin className="mt-0.5 size-4 shrink-0 text-tinta-3" aria-hidden /> <span>{o.location.name}{o.location.address ? ` · ${o.location.address}` : ''}</span></p>
                  {o.notes && <p className="mt-3 text-sm text-tinta-2">{o.notes}</p>}
                  {o.overlaps_my_shifts && !accepted && (
                    <p className="mt-3 flex items-start gap-1.5 text-sm text-aviso"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Se cruza con un turno que ya tienes aceptado.</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                    {accepted ? <StatusDot tone="ok">Te aceptaron</StatusDot>
                      : applied ? (
                        <>
                          <StatusDot tone="aviso">Postulaste, esperando respuesta</StatusDot>
                          <Button size="sm" variant="ghost" loading={withdraw.isPending && withdraw.variables?.id === o.id} onClick={() => withdraw.mutate(o)}>Retirar</Button>
                        </>
                      ) : (
                        <>
                          <Button disabled={full} loading={apply.isPending && apply.variables?.id === o.id} onClick={() => apply.mutate(o)}>{full ? 'Sin cupos' : 'Postular'}</Button>
                          {!full && <span className="text-sm text-tinta-3">{o.slots_left} {o.slots_left === 1 ? 'cupo' : 'cupos'}</span>}
                        </>
                      )}
                  </div>
                </Panel>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
