import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, TextAreaField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { fmtPeriod, LinesList, StatementStatusDot, type Line, type StatementStatus } from '../../lib/pagos'

interface Row {
  id: number; company_name: string; start_date: string; end_date: string; shifts: number; overtime_hours: number; amount: number
  status: StatementStatus; dispute_comment: string | null; admin_reply: string | null
}
interface Detail extends Row { lines: Line[] }

const KEY = ['trab', 'pagos']

export default function MisPagos() {
  const qc = useQueryClient()
  const toast = useToast()
  const [openId, setOpenId] = useState<number | null>(null)
  const [disputing, setDisputing] = useState(false)
  const [comment, setComment] = useState('')

  const list = useQuery({ queryKey: KEY, queryFn: () => api<{ data: Row[] }>('/trabajador/pagos').then((r) => r.data) })
  const detail = useQuery({
    queryKey: [...KEY, openId],
    queryFn: () => api<Detail>(`/trabajador/pagos/${openId}`),
    enabled: openId !== null,
  })

  const done = async (msg: string) => { await qc.invalidateQueries({ queryKey: KEY }); toast.ok(msg); setDisputing(false); setComment(''); setOpenId(null) }
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'No pudimos completar la acción.')

  const accept = useMutation({ mutationFn: () => api(`/trabajador/pagos/${openId}/aceptar`, { method: 'POST' }), onSuccess: () => done('Resumen aceptado.'), onError: fail })
  const dispute = useMutation({
    mutationFn: () => api(`/trabajador/pagos/${openId}/disputar`, { method: 'POST', body: { comment } }),
    onSuccess: () => done('Enviamos tu reclamo a la empresa.'), onError: fail,
  })

  const rows = list.data ?? []
  const d = detail.data
  const pendingCount = rows.filter((r) => r.status === 'sent').length

  return (
    <>
      <PageHeader title="Mis pagos" subtitle="Cuando una empresa cierra un período, aquí ves cuánto te corresponde. Revísalo y acéptalo, o avisa si algo no cuadra. Los montos son brutos." />
      {pendingCount > 0 && <Notice tone="info" className="mb-5">Tienes {pendingCount} {pendingCount === 1 ? 'resumen' : 'resúmenes'} por revisar.</Notice>}

      <Panel className="overflow-hidden">
        {list.isLoading ? <Spinner /> : list.isError ? <div className="p-6"><Notice tone="error">No pudimos cargar tus pagos.</Notice></div> : rows.length === 0 ? (
          <EmptyState title="Aún no tienes resúmenes de pago">Cuando una empresa cierre un período con tus turnos, lo verás aquí.</EmptyState>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="border-b border-linea last:border-b-0">
                <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-arena/60">
                  <div className="min-w-52 flex-1">
                    <p className="font-medium">{r.company_name}</p>
                    <p className="text-sm text-tinta-3">{fmtPeriod(r.start_date, r.end_date)} · {r.shifts} {r.shifts === 1 ? 'turno' : 'turnos'}</p>
                  </div>
                  <div className="w-44"><StatementStatusDot status={r.status} /></div>
                  <p className="w-28 text-right font-medium">{fmtMoney(r.amount)}</p>
                  <ChevronRight className="size-4 text-tinta-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal open={openId !== null} onClose={() => { setOpenId(null); setDisputing(false) }} wide
        title={d ? `${d.company_name} · ${fmtPeriod(d.start_date, d.end_date)}` : 'Resumen de pago'}
        description={d ? `${d.shifts} ${d.shifts === 1 ? 'turno' : 'turnos'}${d.overtime_hours > 0 ? ` · ${d.overtime_hours} h extra` : ''} · Total bruto ${fmtMoney(d.amount)}` : undefined}
        footer={d && !disputing && (d.status === 'sent' || d.status === 'disputed') ? (
          <>
            {d.status === 'sent' && <Button variant="secondary" onClick={() => setDisputing(true)}>Algo no cuadra</Button>}
            <Button loading={accept.isPending} onClick={() => accept.mutate()}>{d.status === 'disputed' ? 'Retirar reclamo y aceptar' : 'Aceptar resumen'}</Button>
          </>
        ) : disputing ? (
          <><Button variant="ghost" onClick={() => setDisputing(false)}>Volver</Button><Button loading={dispute.isPending} disabled={comment.trim().length < 5} onClick={() => dispute.mutate()}>Enviar reclamo</Button></>
        ) : <Button variant="ghost" onClick={() => setOpenId(null)}>Cerrar</Button>}>
        {detail.isLoading ? <Spinner /> : detail.isError || !d ? <Notice tone="error">No pudimos cargar el detalle.</Notice> : (
          <div className="space-y-5">
            <div><StatementStatusDot status={d.status} /></div>
            {d.admin_reply && <Notice tone="info"><strong>Respuesta de {d.company_name}:</strong> {d.admin_reply}</Notice>}
            {d.status === 'disputed' && d.dispute_comment && <Notice tone="aviso"><strong>Tu reclamo:</strong> {d.dispute_comment} La empresa te responderá por correo.</Notice>}
            <LinesList lines={d.lines} />
            {disputing && <TextAreaField label="¿Qué no cuadra?" hint="Por ejemplo: falta el turno del 12, o las horas extra del 15." maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />}
          </div>
        )}
      </Modal>
    </>
  )
}
