import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { addDays, fmtMoney, fmtDate } from '../../lib/format'
import { fmtPeriod } from '../../lib/pagos'

interface Next {
  start_date: string; end_date: string; can_close: boolean
  shifts: number; overtime_hours: number; amount: number; workers: number; carried_over: number; incomplete: number
}
interface Period {
  id: number; start_date: string; end_date: string; status: 'closed' | 'sent'
  shifts: number; overtime_hours: number; amount: number
  statements: { pending: number; sent: number; accepted: number; disputed: number }
}
interface Resp { cycle: 'quincenal' | 'mensual'; next: Next | null; data: Period[] }

export const PERIODS_KEY = ['empresa', 'periodos']

export default function Pagos() {
  const qc = useQueryClient()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const q = useQuery({ queryKey: PERIODS_KEY, queryFn: () => api<Resp>('/empresa/periodos') })

  const close = useMutation({
    mutationFn: () => api('/empresa/periodos/cerrar', { method: 'POST' }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: PERIODS_KEY }); toast.ok('Período cerrado. Revisa los resúmenes y envíalos a los trabajadores.'); setConfirm(false) },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : 'No pudimos cerrar el período.'); setConfirm(false) },
  })

  if (q.isLoading) return <Spinner />
  if (q.isError || !q.data) return <Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar los pagos.'}</Notice>
  const { next, data: periods, cycle } = q.data

  return (
    <>
      <PageHeader title="Pagos" subtitle={`Al terminar cada período ${cycle === 'quincenal' ? 'quincenal' : 'mensual'} lo cierras, cada trabajador recibe su resumen y lo acepta o lo reclama. Los montos son brutos.`}
        actions={<Link to="/empresa/pagos/simulacion"><Button variant="secondary">Simular un cierre</Button></Link>} />

      <section aria-labelledby="h-next" className="mb-8">
        <h2 id="h-next" className="mb-3 text-lg font-semibold">Por cerrar</h2>
        <Panel className="p-5">
          {!next ? (
            <p className="text-sm text-tinta-3">No hay turnos completos pendientes de pago. Cuando los trabajadores marquen entrada y salida, aparecerán aquí.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="min-w-56 flex-1">
                <p className="font-medium">{fmtPeriod(next.start_date, next.end_date)}</p>
                <p className="mt-0.5 text-sm text-tinta-3">
                  {next.shifts} {next.shifts === 1 ? 'turno' : 'turnos'}
                  {next.overtime_hours > 0 && ` · ${next.overtime_hours} h extra`} · {next.workers} {next.workers === 1 ? 'trabajador' : 'trabajadores'}
                </p>
                {!next.can_close && <p className="mt-1 text-sm text-tinta-3">Se puede cerrar desde el {fmtDate(addDays(next.end_date, 1))}.</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-tinta-3">Total bruto</p>
                <p className="text-xl font-semibold">{fmtMoney(next.amount)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/empresa/pagos/por-cerrar"><Button variant="secondary">Ver detalle por trabajador</Button></Link>
                <Button disabled={!next.can_close} onClick={() => setConfirm(true)}>Cerrar período</Button>
              </div>
            </div>
          )}
          {next && next.incomplete > 0 && (
            <Notice tone="aviso" className="mt-4">
              Hay {next.incomplete} {next.incomplete === 1 ? 'asistencia con entrada y sin salida' : 'asistencias con entrada y sin salida'}. No se pagan hasta que las completes en el detalle del turno; si cierras ahora, pasarán al siguiente período.
            </Notice>
          )}
          {next && next.carried_over > 0 && (
            <Notice tone="info" className="mt-4">
              Incluye {next.carried_over} {next.carried_over === 1 ? 'turno' : 'turnos'} de períodos anteriores que se completaron después de cerrarlos.
            </Notice>
          )}
        </Panel>
      </section>

      <section aria-labelledby="h-hist">
        <h2 id="h-hist" className="mb-3 text-lg font-semibold">Períodos cerrados</h2>
        <Panel className="overflow-hidden">
          {periods.length === 0 ? (
            <EmptyState title="Aún no has cerrado ningún período">Cuando cierres el primero, aparecerá aquí con el estado de cada resumen.</EmptyState>
          ) : (
            <ul>
              {periods.map((p) => (
                <li key={p.id} className="border-b border-linea last:border-b-0">
                  <Link to={`/empresa/pagos/${p.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-arena/60">
                    <div className="min-w-52 flex-1">
                      <p className="font-medium">{fmtPeriod(p.start_date, p.end_date)}</p>
                      <p className="text-sm text-tinta-3">{p.shifts} {p.shifts === 1 ? 'turno' : 'turnos'}{p.overtime_hours > 0 && ` · ${p.overtime_hours} h extra`}</p>
                    </div>
                    <div className="w-44 text-sm">
                      {p.statements.disputed > 0
                        ? <StatusDot tone="aviso">{p.statements.disputed} en reclamo</StatusDot>
                        : p.status === 'closed' ? <StatusDot tone="idle">Por enviar</StatusDot>
                        : p.statements.sent > 0 ? <StatusDot tone="info">{p.statements.sent} esperando respuesta</StatusDot>
                        : <StatusDot tone="ok">Todos aceptaron</StatusDot>}
                    </div>
                    <p className="w-28 text-right font-medium">{fmtMoney(p.amount)}</p>
                    <ChevronRight className="size-4 text-tinta-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Cerrar período"
        description={next ? `${fmtPeriod(next.start_date, next.end_date)} · ${fmtMoney(next.amount)}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Volver</Button><Button loading={close.isPending} onClick={() => close.mutate()}>Cerrar período</Button></>}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-tinta-2">
          <li>Las asistencias del período quedan fijas: ya no se podrán editar.</li>
          <li>Se crea un resumen por trabajador. Todavía no se envía: primero lo revisas.</li>
          <li>Si te equivocas y nadie ha aceptado su resumen, puedes reabrir el período.</li>
        </ul>
      </Modal>
    </>
  )
}
