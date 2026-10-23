import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, Download } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { addDays, fmtDate, fmtMoney } from '../../lib/format'
import { downloadPaymentsXlsx } from '../../lib/excel'
import { fmtPeriod, LinesList, summarize, type Line } from '../../lib/pagos'
import { PERIODS_KEY } from './Pagos'

interface Worker { user_id: number; rut: string; first_name: string; last_name: string; shifts: number; overtime_hours: number; amount: number; lines: Line[] }
interface Resp {
  period: { start_date: string; end_date: string; can_close: boolean; shifts: number; overtime_hours: number; amount: number; workers: number; carried_over: number; incomplete: number; pending_requests: number; late_exits: number } | null
  data: Worker[]
}

/** El período por cerrar, trabajador por trabajador: qué se le paga y por qué. */
export default function PagoPorCerrar() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  const q = useQuery({ queryKey: ['empresa', 'pendiente'], queryFn: () => api<Resp>('/empresa/periodos/pendiente') })

  const close = useMutation({
    mutationFn: () => api<{ id: number }>('/empresa/periodos/cerrar', { method: 'POST' }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: PERIODS_KEY }); await qc.invalidateQueries({ queryKey: ['empresa', 'pendiente'] })
      toast.ok('Período cerrado. Revisa los resúmenes y envíalos a los trabajadores.')
      nav(`/empresa/pagos/${r.id}`)
    },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : 'No pudimos cerrar el período.'); setConfirm(false) },
  })

  const xlsx = useMutation({
    mutationFn: () => downloadPaymentsXlsx({
      title: `Borrador ${fmtPeriod(q.data!.period!.start_date, q.data!.period!.end_date)}`,
      fileName: `borrador_${q.data!.period!.start_date}_${q.data!.period!.end_date}.xlsx`,
      workers: q.data!.data.map((w) => ({ rut: w.rut, name: `${w.first_name} ${w.last_name}`, lines: w.lines })),
    }),
    onError: () => toast.error('No pudimos generar el Excel.'),
  })

  if (q.isLoading) return <Spinner />
  if (q.isError || !q.data) return <Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar el período.'}</Notice>
  const { period: p, data } = q.data

  return (
    <>
      <Link to="/empresa/pagos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tinta-3 hover:text-tinta"><ArrowLeft className="size-4" aria-hidden /> Pagos</Link>
      {!p ? (
        <Panel><EmptyState title="No hay nada por cerrar">Cuando los trabajadores marquen entrada y salida, sus turnos aparecerán aquí.</EmptyState></Panel>
      ) : (
        <>
          <PageHeader
            title={fmtPeriod(p.start_date, p.end_date)}
            subtitle={`${p.shifts} ${p.shifts === 1 ? 'turno' : 'turnos'}${p.overtime_hours > 0 ? ` · ${p.overtime_hours} h extra` : ''} · ${p.workers} ${p.workers === 1 ? 'trabajador' : 'trabajadores'} · Total bruto ${fmtMoney(p.amount)}`}
            actions={<><Button variant="secondary" loading={xlsx.isPending} onClick={() => xlsx.mutate()}><Download className="size-4" aria-hidden /> Descargar Excel</Button><Button disabled={!p.can_close || p.pending_requests > 0} onClick={() => setConfirm(true)}>Cerrar período</Button></>}
          />
          {!p.can_close && <Notice tone="info" className="mb-5">Este período aún no termina; se puede cerrar desde el {fmtDate(addDays(p.end_date, 1))}. Mientras tanto puedes revisar cómo va.</Notice>}
          {p.pending_requests > 0 && <Notice tone="aviso" className="mb-5">Hay {p.pending_requests} {p.pending_requests === 1 ? 'solicitud de horas extra sin responder' : 'solicitudes de horas extra sin responder'}. <Link to="/empresa/horas-extra" className="font-medium underline">Respóndelas</Link> antes de cerrar.</Notice>}
          {p.late_exits > 0 && <Notice tone="aviso" className="mb-5">{p.late_exits === 1 ? 'Un turno tiene una salida tardía' : `${p.late_exits} turnos tienen salidas tardías`} sin horas extra autorizadas. No se pagan si no las autorizas. <Link to="/empresa/horas-extra" className="font-medium underline">Revisar</Link></Notice>}
          {p.incomplete > 0 && <Notice tone="aviso" className="mb-5">Hay {p.incomplete} {p.incomplete === 1 ? 'asistencia con entrada y sin salida' : 'asistencias con entrada y sin salida'}; no se pagan hasta que las completes en el detalle del turno.</Notice>}

          <p className="mb-3 text-sm text-tinta-3">Abre cada trabajador para ver turno por turno qué marcó, qué tarifa se aplicó y de dónde sale el monto.</p>
          <Panel className="overflow-hidden">
            <ul>
              {data.map((w) => {
                const isOpen = open === w.user_id
                return (
                  <li key={w.user_id} className="border-b border-linea last:border-b-0">
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : w.user_id)}
                      className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-arena/60">
                      <div className="min-w-52 flex-1">
                        <p className="font-medium">{w.first_name} {w.last_name}</p>
                        <p className="text-sm text-tinta-3">{w.rut} · {summarize(w.lines)}</p>
                      </div>
                      <p className="w-28 text-right font-medium">{fmtMoney(w.amount)}</p>
                      <ChevronDown className={`size-4 text-tinta-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                    </button>
                    {isOpen && <div className="border-t border-linea bg-crema px-5 py-4"><LinesList lines={w.lines} showAlerts /></div>}
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Modal open={confirm} onClose={() => setConfirm(false)} title="Cerrar período" description={`${fmtPeriod(p.start_date, p.end_date)} · ${fmtMoney(p.amount)}`}
            footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Volver</Button><Button loading={close.isPending} onClick={() => close.mutate()}>Cerrar período</Button></>}>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-tinta-2">
              <li>Las asistencias del período quedan fijas: ya no se podrán editar.</li>
              <li>Se crea un resumen por trabajador. Todavía no se envía: primero lo revisas.</li>
              <li>Si te equivocas y nadie ha aceptado su resumen, puedes reabrir el período.</li>
            </ul>
          </Modal>
        </>
      )}
    </>
  )
}
